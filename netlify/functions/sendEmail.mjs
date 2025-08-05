import nodemailer from "nodemailer";
import dotenv from "dotenv";
import * as XLSX from "xlsx";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    
  },
});

export const handler = async (event) => {
  // Add CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ success: false, error: "Method Not Allowed" }),
      };
    }

    // Check if environment variables are set
    if (
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASS ||
      !process.env.EMAIL_RECEIVER
    ) {
      console.error("❌ Missing environment variables:", {
        EMAIL_USER: !!process.env.EMAIL_USER,
        EMAIL_PASS: !!process.env.EMAIL_PASS,
        EMAIL_RECEIVER: !!process.env.EMAIL_RECEIVER,
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Server configuration error - please contact administrator",
        }),
      };
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
        const idCardFile = files.find((f) => f.name === "idCard");

        console.log("🔍 Looking for signature file:", signatureFile);
        console.log("🔍 Looking for ID card file:", idCardFile);

        // Check if ID card is uploaded
        if (!idCardFile) {
          console.error("❌ Missing ID card file");
          console.log("📁 Available files:", files);
          return resolve({
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: "Missing ID card",
            }),
          });
        }

        // Check if signature file exists
        if (!signatureFile) {
          console.error("❌ Missing signature file");
          console.log("📁 Available files:", files);
          return resolve({
            statusCode: 400,
            headers,
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
            "טלפון נייד": fields.phone || "",
            "תאריך לידה": `${fields.birthDay || ""}/${
              fields.birthMonth || ""
            }/${fields.birthYear || ""}`,
            יישוב: fields.city || "",
            מין: fields.gender || "",
            "דואר אלקטרוני": fields.email || "",
            "הסכמה לפרסום בפייסבוק": fields.facebookConsent || "",
            מסלול: "תואר B.A רב תחומי וחינוך - מכללת כנרת",
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
        const fileName = `registration_kinneret_${
          new Date().toISOString().split("T")[0]
        }_${Date.now()}.xlsx`;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_RECEIVER,
          subject: "הרשמה חדשה למכללת כנרת",
          html: `
            <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
              <h2 style="color: #1976d2; text-align: center;">הרשמה חדשה - מכללת כנרת</h2>
              <h3 style="color: #333;">פרטים אישיים:</h3>
              <p><strong>שם פרטי:</strong> ${fields.firstName || ""}</p>
              <p><strong>שם משפחה:</strong> ${fields.lastName || ""}</p>
              <p><strong>תעודת זהות:</strong> ${fields.idNumber || ""}</p>
              <p><strong>טלפון נייד:</strong> ${fields.phone || ""}</p>
              <p><strong>תאריך לידה:</strong> ${fields.birthDay || ""}/${
            fields.birthMonth || ""
          }/${fields.birthYear || ""}</p>
              <p><strong>יישוב:</strong> ${fields.city || ""}</p>
              <p><strong>מין:</strong> ${fields.gender || ""}</p>
              <p><strong>דואר אלקטרוני:</strong> ${fields.email || ""}</p>
              
              <h3 style="color: #333;">הסכמות:</h3>
              <p><strong>הסכמה לפרסום בפייסבוק:</strong> ${
                fields.facebookConsent || ""
              }</p>
              <p><strong>קראתי והסכמתי על כל מה שכתוב:</strong> ${
                fields.agreement ? "כן" : "לא"
              }</p>
              
              <h3 style="color: #333;">תמונת תעודת זהות:</h3>
              <p><img src="cid:idCard" width="300" style="border: 1px solid #ddd; padding: 10px;"/></p>
              
              <h3 style="color: #333;">חתימה דיגיטלית:</h3>
              <p><img src="cid:signature" width="300" style="border: 1px solid #ddd; padding: 10px;"/></p>
              
              <hr style="margin: 20px 0;">
              <p style="font-size: 12px; color: #666;">
                הרשמה זו נשלחה דרך טופס ההרשמה הדיגיטלי של מכללת כנרת<br>
                תאריך שליחה: ${new Date().toLocaleString("he-IL")}
              </p>
            </div>
          `,
          attachments: [
            {
              filename: fileName,
              content: excelBuffer, // Changed from csvData to excelBuffer
              contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // Changed content type for Excel
            },
            {
              filename: "idCard.jpg",
              content: idCardFile.content,
              contentType: idCardFile.contentType,
              cid: "idCard",
            },
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
            headers,
            body: JSON.stringify({
              success: true,
              message: "הטופס נשלח בהצלחה",
            }),
          });
        } catch (error) {
          console.error("❌ Failed to send email:", error);
          resolve({
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: error.message,
            }),
          });
        }
      });

      bb.end(rawBody);
    });
  } catch (err) {
    console.error("❌ Handler failed:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: err.message,
      }),
    };
  }
};
