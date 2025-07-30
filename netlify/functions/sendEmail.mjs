import nodemailer from "nodemailer";
import dotenv from "dotenv";
import XLSX from "xlsx";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const rawBody = Buffer.from(event.body, "base64");
    const contentType = event.headers["content-type"];
    const busboyModule = await import("busboy");
    const bb = busboyModule.default({
      headers: { "content-type": contentType },
    });

    const fields = {};
    const files = [];

    return new Promise((resolve) => {
      bb.on("field", (name, val) => {
        fields[name] = val;
      });

      bb.on("file", (name, file, info) => {
        const buffers = [];
        file.on("data", (d) => buffers.push(d));
        file.on("end", () => {
          files.push({
            name,
            filename: info.filename,
            content: Buffer.concat(buffers),
            contentType: info.mimeType,
          });
        });
      });

      bb.on("finish", async () => {
        console.log("✅ Fields received:", fields);
        console.log(
          "✅ Files received:",
          files.map((f) => `${f.name} (${f.filename})`)
        );

        const signatureFile = files.find(
          (f) => f.name === "signature" || f.filename === "signature.png"
        );

        if (!signatureFile) {
          console.error("❌ Missing signature file");
          return resolve({
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              error: "Missing signature",
            }),
          });
        }

        // Create Excel file with form data
        const excelData = [
          {
            "תאריך הרשמה": new Date().toLocaleString("he-IL"),
            "שם פרטי": fields.firstName || "",
            "שם משפחה": fields.lastName || "",
            "תעודת זהות": fields.idNumber || "",
            מין: fields.gender || "",
            טלפון: fields.phone || "",
            מסלול: fields.program || "",
            "הסכמה לתנאים": fields.agreement ? "כן" : "לא",
            "קבצים מצורפים": files
              .filter((f) => f.name !== "signature")
              .map((f) => f.filename)
              .join(", "),
          },
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Registrations");

        // Generate Excel file buffer
        const excelBuffer = XLSX.write(workbook, {
          type: "buffer",
          bookType: "xlsx",
        });
        const fileName = `registration_${
          new Date().toISOString().split("T")[0]
        }_${Date.now()}.xlsx`;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_RECEIVER,
          subject: "הרשמה חדשה למכללת אופק טירה",
          html: `
            <p><strong>שם פרטי:</strong> ${fields.firstName || ""}</p>
            <p><strong>שם משפחה:</strong> ${fields.lastName || ""}</p>
            <p><strong>תעודת זהות:</strong> ${fields.idNumber || ""}</p>
            <p><strong>טלפון:</strong> ${fields.phone || ""}</p>
            <p><strong>תאריך לידה:</strong> ${fields.birthDay || ""}/${
            fields.birthMonth || ""
          }/${fields.birthYear || ""}</p>
            <p><strong>יישוב:</strong> ${fields.city || ""}</p>
            <p><strong>מין:</strong> ${fields.gender || ""}</p>
            <p><strong>דואר אלקטרוני:</strong> ${fields.email || ""}</p>
            <p><strong>הסכמה לפרסום בפייסבוק:</strong> ${
              fields.facebookConsent || ""
            }</p>
            <p><strong>שם יועץ/ת:</strong> ${fields.advisorName || ""}</p>
            <p><strong>חתימת יועץ/ת:</strong> ${
              fields.advisorSignature || ""
            }</p>
            <p><strong>חתימה:</strong><br><img src="cid:signature" width="200"/></p>
          `,
          attachments: [
            {
              filename: fileName,
              content: excelBuffer,
              contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
            ...files
              .filter((f) => f.name !== "signature")
              .map((f) => ({
                filename: f.filename,
                content: f.content,
                contentType: f.contentType,
              })),
            {
              filename: "signature.png",
              content: signatureFile.content,
              contentType: signatureFile.contentType,
              cid: "signature",
            },
          ],
        };

        try {
          await transporter.sendMail(mailOptions);
          console.log("✅ Email sent successfully");
          resolve({
            statusCode: 200,
            body: JSON.stringify({ success: true }),
          });
        } catch (error) {
          console.error("❌ Failed to send email:", error);
          resolve({
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message }),
          });
        }
      });

      bb.end(rawBody);
    });
  } catch (err) {
    console.error("❌ Handler failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
