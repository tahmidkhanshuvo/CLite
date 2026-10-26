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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = input.value.trim();

    if (!key) {
      error.textContent = "Enter a team key to continue.";
      input.focus();
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    error.textContent = "Checking access...";
    try {
      const result = await fetch("/api/team/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });
      const payload = await result.json().catch(() => ({ error: "Please wait before trying again." }));
      if (!result.ok) throw new Error(payload.error);
      input.value = "";
      window.location.href = "/team";
    } catch (err) {
      error.textContent = err.message || "Unable to sign in.";
    } finally { submit.disabled = false; }
  });
  if (new URLSearchParams(location.search).get("team") === "login") openDialog();
})();
