const imagePaths = [
  "img/Home.png",
  "img/Home2.jpg",
  "img/Home3.jpg",
  "img/Home4.jpg",
  "img/Home5.jpg",
  "img/Home6.jpg",
  "img/Home7.jpg",
  "img/Home8.jpg",
  "img/Home9.jpg",
  "img/Home10.jpg",
  "img/Home11.jpg",
  "img/Home12.jpg",
  "img/Home13.jpg",
];

const slider = document.getElementById("slider");
const dotsContainer = document.getElementById("dots");
let currentIndex = 0;
let intervalId;

function renderImage(index) {
  // Create and style new image
  const img = document.createElement("img");
  img.src = imagePaths[index];
  img.alt = `Image ${index + 1}`;
  img.className =
    "w-full h-full object-contain opacity-0 transition-opacity duration-700 absolute inset-0";

  // Clear slider and insert image
  slider.innerHTML = "";
  slider.appendChild(img);

  // Delay the fade-in just enough to trigger transition reliably
  setTimeout(() => {
    img.classList.add("opacity-100");
  }, 20); // ~1 frame delay

  updateDots();
}

function updateDots() {
  Array.from(dotsContainer.children).forEach((dot, i) => {
    dot.classList.toggle("bg-white", i === currentIndex);
    dot.classList.toggle("bg-gray-500", i !== currentIndex);
  });
}

function goToSlide(index) {
  currentIndex = index;
  renderImage(currentIndex);
}

function nextSlide() {
  const nextIndex = (currentIndex + 1) % imagePaths.length;
  goToSlide(nextIndex);
}

function prevSlide() {
  const prevIndex = (currentIndex - 1 + imagePaths.length) % imagePaths.length;
  goToSlide(prevIndex);
}

function startAutoSlide() {
  intervalId = setInterval(nextSlide, 2000);
}

function stopAutoSlide() {
  clearInterval(intervalId);
}

// Create dots
imagePaths.forEach((_, index) => {
  const dot = document.createElement("button");
  dot.className = "w-3 h-3 rounded-full bg-black hover:bg-white transition-all";
  dot.addEventListener("click", () => {
    stopAutoSlide();
    goToSlide(index);
    startAutoSlide();
  });
  dotsContainer.appendChild(dot);
});

// Button Events
document.getElementById("nextBtn").addEventListener("click", () => {
  stopAutoSlide();
  nextSlide();
  startAutoSlide();
});

document.getElementById("prevBtn").addEventListener("click", () => {
  stopAutoSlide();
  prevSlide();
  startAutoSlide();
});

// Init
renderImage(currentIndex);
startAutoSlide();
