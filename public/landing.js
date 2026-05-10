(function () {
  "use strict";

  const teamButton = document.getElementById("teamButton");
  const dialog = document.getElementById("teamDialog");
  const form = document.getElementById("teamForm");
  const input = document.getElementById("teamKey");
  const error = document.getElementById("teamError");
  const closeButton = document.getElementById("teamClose");
  const cancelButton = document.getElementById("teamCancel");

  function openDialog() {
    error.textContent = "";
    input.value = "";

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      requestAnimationFrame(() => input.focus());
      return;
    }

    dialog.setAttribute("open", "");
    input.focus();
  }

  function closeDialog() {
    dialog.close();
    teamButton.focus();
  }

  teamButton.addEventListener("click", openDialog);
  closeButton.addEventListener("click", closeDialog);
  cancelButton.addEventListener("click", closeDialog);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = input.value.trim();

    if (!key) {
      error.textContent = "Enter a team key to continue.";
      input.focus();
      return;
    }

    window.location.href = `/team?key=${encodeURIComponent(key)}`;
  });
})();
