(function () {
  "use strict";

  const STORAGE_KEY = "context-capsule-data";
  const SAMPLE_CAPSULES = [
    {
      title: "Polish the onboarding flow",
      project: "Northstar",
      task: "Tighten the first-run experience for new workspace members.",
      lastStep: "Mapped the three key drop-off points in the setup flow.",
      nextAction: "Replace the empty state copy on the integrations step.",
      notes: "Keep the tone direct and calm. Review with the product checklist after the copy pass.",
      pinned: true,
      createdAt: Date.now() - 86400000
    },
    {
      title: "Investigate slow report queries",
      project: "Ledger API",
      task: "Find the source of the latency spike in monthly reports.",
      lastStep: "Confirmed the slowdown is isolated to the invoice aggregation query.",
      nextAction: "Add an EXPLAIN ANALYZE snapshot to the issue.",
      notes: "Compare the index plan before and after the recent customer_id migration.",
      pinned: false,
      createdAt: Date.now() - 172800000
    }
  ];

  const $ = (selector) => document.querySelector(selector);
  const form = $("#capsuleForm");
  const list = $("#capsuleList");
  const searchInput = $("#searchInput");
  const notes = $("#notes");
  let capsules = [];
  let editingId = null;
  let pendingConfirm = null;
  let toastTimer;

  function makeId() {
    return "capsule-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadCapsules() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        capsules = SAMPLE_CAPSULES.map((capsule) => ({ ...capsule, id: makeId() }));
        saveCapsules();
        return;
      }
      const parsed = JSON.parse(stored);
      capsules = Array.isArray(parsed) ? parsed.filter(isValidCapsule).map(normalizeCapsule) : [];
    } catch (error) {
      capsules = [];
      showToast("Saved data could not be read. Starting with an empty workspace.");
    }
  }

  function isValidCapsule(item) {
    return item && typeof item === "object" && typeof item.title === "string" &&
      typeof item.project === "string" && typeof item.task === "string" &&
      typeof item.nextAction === "string";
  }

  function normalizeCapsule(item) {
    return {
      id: typeof item.id === "string" ? item.id : makeId(),
      title: item.title.trim(),
      project: item.project.trim(),
      task: item.task.trim(),
      lastStep: typeof item.lastStep === "string" ? item.lastStep.trim() : "",
      nextAction: item.nextAction.trim(),
      notes: typeof item.notes === "string" ? item.notes.trim() : "",
      pinned: Boolean(item.pinned),
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : undefined
    };
  }

  function saveCapsules() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capsules));
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
  }

  function render() {
    const query = searchInput.value.trim().toLowerCase();
    const visible = capsules
      .filter((capsule) => [capsule.title, capsule.project, capsule.task, capsule.notes].join(" ").toLowerCase().includes(query))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    $("#capsuleCount").textContent = capsules.length;
    list.innerHTML = visible.length ? visible.map(cardTemplate).join("") : emptyTemplate(query);
    list.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleCardAction));
  }

  function cardTemplate(capsule) {
    return `
      <article class="capsule-card">
        <div class="card-top">
          <div>
            <div class="card-project">${escapeHtml(capsule.project)}</div>
            <h3 class="card-title">${escapeHtml(capsule.title)}</h3>
          </div>
          <button class="pin-button ${capsule.pinned ? "pinned" : ""}" data-action="pin" data-id="${escapeHtml(capsule.id)}" type="button" aria-label="${capsule.pinned ? "Unpin" : "Pin"} ${escapeHtml(capsule.title)}" aria-pressed="${capsule.pinned}">${capsule.pinned ? "●" : "○"}</button>
        </div>
        <p class="card-task">${escapeHtml(capsule.task)}</p>
        <div class="card-meta">
          <div><span class="meta-label">Next action</span><span class="meta-value">${escapeHtml(capsule.nextAction)}</span></div>
          <div><span class="meta-label">Saved</span><span class="meta-value">${formatDate(capsule.updatedAt || capsule.createdAt)}</span></div>
        </div>
        <div class="card-actions">
          <button class="button resume-button" data-action="resume" data-id="${escapeHtml(capsule.id)}" type="button">Resume <span aria-hidden="true">→</span></button>
          <button class="button button-quiet" data-action="edit" data-id="${escapeHtml(capsule.id)}" type="button">Edit</button>
          <button class="button button-quiet danger-text" data-action="delete" data-id="${escapeHtml(capsule.id)}" type="button">Delete</button>
        </div>
      </article>`;
  }

  function emptyTemplate(query) {
    return `<div class="empty-state"><h3>${query ? "No capsules found" : "Your workspace is clear"}</h3><p>${query ? "Try a different search term." : "Capture what you are working on above, and make your next return effortless."}</p></div>`;
  }

  function clearValidation() {
    form.querySelectorAll(".field").forEach((field) => field.classList.remove("invalid"));
    form.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
  }

  function validate(data) {
    clearValidation();
    const required = ["title", "project", "task", "nextAction"];
    let valid = true;
    required.forEach((name) => {
      if (!data[name].trim()) {
        const field = form.querySelector(`[name="${name}"]`).closest(".field");
        field.classList.add("invalid");
        field.querySelector(".field-error").textContent = "This field is required.";
        valid = false;
      }
    });
    return valid;
  }

  function getFormData() {
    return Object.fromEntries(new FormData(form).entries());
  }

  function resetForm() {
    form.reset();
    clearValidation();
    editingId = null;
    $("#saveButtonLabel").textContent = "Save capsule";
    $("#cancelEditButton").hidden = true;
    $("#formStatus").textContent = "";
    updateNotesCount();
  }

  function beginEdit(capsule) {
    editingId = capsule.id;
    ["title", "project", "task", "lastStep", "nextAction", "notes"].forEach((name) => {
      $(`#${name}`).value = capsule[name] || "";
    });
    $("#saveButtonLabel").textContent = "Update capsule";
    $("#cancelEditButton").hidden = false;
    $("#formStatus").textContent = "Editing capsule";
    updateNotesCount();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    $("#title").focus();
  }

  function handleSubmit(event) {
    event.preventDefault();
    const data = getFormData();
    if (!validate(data)) return;
    const now = Date.now();
    if (editingId) {
      capsules = capsules.map((capsule) => capsule.id === editingId ? { ...capsule, ...data, updatedAt: now } : capsule);
      showToast("Capsule updated.");
    } else {
      capsules.unshift(normalizeCapsule({ ...data, id: makeId(), createdAt: now, updatedAt: now, pinned: false }));
      showToast("Capsule saved.");
    }
    saveCapsules();
    resetForm();
  }

  function handleCardAction(event) {
    const id = event.currentTarget.dataset.id;
    const action = event.currentTarget.dataset.action;
    const capsule = capsules.find((item) => item.id === id);
    if (!capsule) return;
    if (action === "edit") beginEdit(capsule);
    if (action === "resume") {
      beginEdit(capsule);
      showToast("Ready to resume. Your next action is in focus.");
    }
    if (action === "pin") {
      capsule.pinned = !capsule.pinned;
      capsule.updatedAt = Date.now();
      saveCapsules();
      showToast(capsule.pinned ? "Capsule pinned." : "Capsule unpinned.");
    }
    if (action === "delete") confirmAction("Delete this capsule?", "This capsule will be removed permanently.", () => {
      capsules = capsules.filter((item) => item.id !== id);
      saveCapsules();
      if (editingId === id) resetForm();
      showToast("Capsule deleted.");
    });
  }

  function confirmAction(title, message, callback) {
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    pendingConfirm = callback;
    const dialog = $("#confirmDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else if (window.confirm(message)) callback();
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function updateNotesCount() {
    $("#notesCount").textContent = notes.value.length;
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(capsules, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `context-capsules-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Capsules exported.");
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed) || parsed.length > 500 || !parsed.every(isValidCapsule)) throw new Error("invalid");
        const imported = parsed.map(normalizeCapsule);
        capsules = imported;
        saveCapsules();
        showToast(`${imported.length} capsule${imported.length === 1 ? "" : "s"} imported.`);
      } catch (error) {
        showToast("Import failed. Choose a valid Context Capsule JSON file.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  form.addEventListener("submit", handleSubmit);
  form.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") form.requestSubmit();
  });
  $("#cancelEditButton").addEventListener("click", resetForm);
  notes.addEventListener("input", updateNotesCount);
  searchInput.addEventListener("input", render);
  $("#exportButton").addEventListener("click", exportData);
  $("#importButton").addEventListener("click", () => $("#importInput").click());
  $("#importInput").addEventListener("change", importData);
  $("#clearAllButton").addEventListener("click", () => {
    if (!capsules.length) return showToast("There are no capsules to clear.");
    confirmAction("Clear all capsules?", "Every saved capsule will be removed permanently.", () => {
      capsules = [];
      saveCapsules();
      resetForm();
      showToast("All capsules cleared.");
    });
  });
  $("#confirmAction").addEventListener("click", (event) => {
    event.preventDefault();
    if (pendingConfirm) pendingConfirm();
    pendingConfirm = null;
    $("#confirmDialog").close();
  });
  $("#confirmDialog").addEventListener("close", () => { pendingConfirm = null; });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      event.preventDefault();
      searchInput.focus();
    }
  });

  loadCapsules();
  updateNotesCount();
  render();
})();
