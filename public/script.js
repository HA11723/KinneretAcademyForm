const form = document.getElementById("registrationForm");
const canvas = document.getElementById("signature-pad");
const ctx = canvas.getContext("2d");
const errorMsg = document.getElementById("errorMsg");
const idCardUpload = document.getElementById("idCardUpload");
const idCardPreview = document.getElementById("idCardPreview");
const previewImage = document.getElementById("previewImage");
let isDrawing = false;
let isSubmitting = false; // Prevent multiple submissions

// ID Card Upload Preview
idCardUpload.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      previewImage.src = e.target.result;
      idCardPreview.style.display = "block";
    };
    reader.readAsDataURL(file);
  }
});

function removeIdCard() {
  idCardUpload.value = "";
  idCardPreview.style.display = "none";
  previewImage.src = "";
}

// Canvas setup
ctx.strokeStyle = "#000";
ctx.lineWidth = 2;
ctx.lineCap = "round";

// Mouse events
canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
});
canvas.addEventListener("mousemove", (e) => {
  if (isDrawing) {
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  }
});
canvas.addEventListener("mouseup", () => (isDrawing = false));
canvas.addEventListener("mouseleave", () => (isDrawing = false));

// Touch events
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  isDrawing = true;
  const pos = getTouchPos(canvas, e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
});
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (isDrawing) {
    const pos = getTouchPos(canvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }
});
canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  isDrawing = false;
});

function getTouchPos(canvasDom, e) {
  const rect = canvasDom.getBoundingClientRect();
  return {
    x: e.touches[0].clientX - rect.left,
    y: e.touches[0].clientY - rect.top,
  };
}

function clearSignature() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Form submission
form.addEventListener("submit", function (event) {
  event.preventDefault();
  errorMsg.textContent = "";

  // Prevent multiple submissions
  if (isSubmitting) {
    return;
  }

  isSubmitting = true;
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "שולח...";

  // Check if ID card is uploaded
  if (!idCardUpload.files[0]) {
    errorMsg.textContent = "אנא העלה תמונת תעודת זהות לפני השליחה.";
    submitButton.disabled = false;
    submitButton.textContent = originalText;
    isSubmitting = false;
    return;
  }

  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (idCardUpload.files[0].size > maxSize) {
    errorMsg.textContent = "גודל הקובץ גדול מדי. אנא העלה קובץ קטן מ-5MB.";
    submitButton.disabled = false;
    submitButton.textContent = originalText;
    isSubmitting = false;
    return;
  }

  // Check if signature is empty
  const blank = document.createElement("canvas");
  blank.width = canvas.width;
  blank.height = canvas.height;
  const blankSignature = blank.toDataURL();
  if (canvas.toDataURL() === blankSignature) {
    errorMsg.textContent = "אנא חתום בטופס לפני השליחה.";
    submitButton.disabled = false;
    submitButton.textContent = originalText;
    isSubmitting = false;
    return;
  }

  const formData = new FormData(form);

  // Add signature as PNG blob
  canvas.toBlob((blob) => {
    formData.append("signature", blob, "signature.png");

    fetch("/.netlify/functions/sendEmail", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          // Redirect to success page in the same window
          window.location.href = "/success.html";
        } else {
          errorMsg.textContent = `⚠️ שגיאה בשליחה: ${
            data.error || "שגיאה לא ידועה"
          }`;
          // Re-enable submit button on error
          submitButton.disabled = false;
          submitButton.textContent = originalText;
          isSubmitting = false;
        }
      })
      .catch((err) => {
        console.error("❌ Error sending:", err);
        errorMsg.textContent =
          "⚠️ שגיאה בשליחה לשרת. אנא נסה שוב או פנה לתמיכה.";
        // Re-enable submit button on error
        submitButton.disabled = false;
        submitButton.textContent = originalText;
        isSubmitting = false;
      });
  }, "image/png");
});
