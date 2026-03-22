const frame = document.getElementById("app-frame");
const offline = document.getElementById("offline");

function checkConnection() {
  fetch("http://localhost:5173", { mode: "no-cors" })
    .then(() => {
      frame.style.display = "block";
      offline.style.display = "none";
    })
    .catch(() => {
      frame.style.display = "none";
      offline.style.display = "flex";
    });
}

function retryConnection() {
  checkConnection();
  frame.src = "http://localhost:5173";
}

frame.addEventListener("error", () => {
  frame.style.display = "none";
  offline.style.display = "flex";
});

checkConnection();
