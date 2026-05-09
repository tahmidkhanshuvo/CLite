(function () {
  "use strict";

  document.getElementById("teamButton").addEventListener("click", () => {
    const key = window.prompt("Team key");
    if (key) window.location.href = `/team?key=${encodeURIComponent(key)}`;
  });
})();
