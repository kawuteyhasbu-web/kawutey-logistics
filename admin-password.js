document.addEventListener("DOMContentLoaded", function () {
  const button = document.getElementById("togglePassword");
  const password = document.getElementById("password");
  if (!button || !password) return;
  button.addEventListener("click", function () {
    const showPassword = password.type === "password";
    password.type = showPassword ? "text" : "password";
    button.textContent = showPassword ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(showPassword));
    password.focus();
  });
});
