const form = document.getElementById("registrationForm");
const canvas = document.getElementById("signature-pad");
const ctx = canvas.getContext("2d");
const errorMsg = document.getElementById("errorMsg");
let isDrawing = false;

// Canvas setup
ctx.strokeStyle = "#000";
ctx.lineWidth = 2;
ctx.lineCap = "round";

// Mouse events
canvas.addEventListener("mousedown", e => {
  isDrawing = true;
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
});
canvas.addEventListener("mousemove", e => {
  if (isDrawing) {
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  }
});
canvas.addEventListener("mouseup", () => (isDrawing = false));
canvas.addEventListener("mouseleave", () => (isDrawing = false));

// Touch events
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  isDrawing = true;
  const pos = getTouchPos(canvas, e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
});
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (isDrawing) {
    const pos = getTouchPos(canvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }
});
canvas.addEventListener("touchend", e => {
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

  const formData = new FormData(form);

  // Check if signature is empty
  const blank = document.createElement("canvas");
  blank.width = canvas.width;
  blank.height = canvas.height;
  const blankSignature = blank.toDataURL();
  if (canvas.toDataURL() === blankSignature) {
    errorMsg.textContent = "אנא חתום בטופס לפני השליחה.";
    return;
  }

  // Add signature as PNG blob
  canvas.toBlob(blob => {
    formData.append("signature", blob, "signature.png");

    fetch("/.netlify/functions/sendEmail", {
      method: "POST",
      body: formData,
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          window.open("/success.html", "_blank");
          form.reset();
          clearSignature();
        } else {
          errorMsg.textContent = "⚠️ שגיאה בשליחה.";
        }
      })
      .catch(err => {
        console.error("❌ Error sending:", err);
        errorMsg.textContent = "⚠️ שגיאה בשליחה לשרת.";
      });
  }, "image/png");
});
