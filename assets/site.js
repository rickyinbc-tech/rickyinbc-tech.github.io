const year = document.querySelector("#year");
if (year) {
  year.textContent = new Date().getFullYear();
}

const modal = document.querySelector("#artModal");
const modalImage = document.querySelector("#modalImage");
const modalTitle = document.querySelector("#modalTitle");
const modalMeta = document.querySelector("#modalMeta");
const modalNote = document.querySelector("#modalNote");
const modalPrint = document.querySelector("#modalPrint");
const closeButton = document.querySelector(".modal-close");
let previousFocus = null;

function openModal(card) {
  if (!modal || !modalImage || !closeButton) return;
  previousFocus = document.activeElement;
  modalImage.src = card.dataset.full;
  modalImage.alt = card.querySelector("img")?.alt || "";
  modalTitle.textContent = card.dataset.title || "Artwork";
  modalMeta.textContent = card.dataset.meta || "";
  modalNote.textContent = card.dataset.note || "";
  if (modalPrint) {
    modalPrint.textContent = card.dataset.print || "Archival pigment print. Edition information available on request.";
  }
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  closeButton.focus();
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (previousFocus) {
    previousFocus.focus();
  }
}

document.querySelectorAll(".work-card").forEach((card) => {
  card.addEventListener("click", () => openModal(card));
});

if (closeButton) {
  closeButton.addEventListener("click", closeModal);
}

if (modal) {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal?.classList.contains("is-open")) {
    closeModal();
  }
});

const filterButtons = document.querySelectorAll("[data-filter]");
const filterItems = document.querySelectorAll("[data-series]");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    filterItems.forEach((item) => {
      const show = filter === "all" || item.dataset.series === filter;
      item.hidden = !show;
    });
  });
});

const inquiryForm = document.querySelector("[data-inquiry-form]");
if (inquiryForm) {
  inquiryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(inquiryForm);
    const subject = encodeURIComponent(data.get("subject") || "Ricky Kwok art inquiry");
    const lines = [
      `Name: ${data.get("name") || ""}`,
      `Email: ${data.get("email") || ""}`,
      `Inquiry type: ${data.get("type") || ""}`,
      `Artwork or series: ${data.get("artwork") || ""}`,
      "",
      data.get("message") || ""
    ];
    window.location.href = `mailto:studio@rickykwok.com?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
  });
}
