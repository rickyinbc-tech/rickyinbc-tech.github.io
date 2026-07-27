export const RESOLUTION_MANIFEST_RELATIVE = ".github/data/photo-resolution-manifest.json";

export const GENUINE_SOURCE_UPGRADES = [
  {
    canonical: "assets/art/ancestral-kitchen-light.jpg",
    source: "assets/projects/travel/travel-10.jpg",
    crop: { left: 0, top: 15, width: 1800, height: 1168 },
  },
  {
    canonical: "assets/art/coil-field-monochrome.jpg",
    source: "assets/projects/travel/travel-03.jpg",
    crop: { left: 0, top: 14, width: 1800, height: 1169 },
  },
  {
    canonical: "assets/art/fishpond-harvest.jpg",
    source: "assets/projects/travel/travel-02.jpg",
    crop: { left: 0, top: 15, width: 1800, height: 1168 },
  },
  {
    canonical: "assets/art/hearth-ritual.jpg",
    source: "assets/projects/travel/travel-09.jpg",
    crop: { left: 0, top: 15, width: 1800, height: 1168 },
  },
  {
    canonical: "assets/art/horse-racing-pack.jpg",
    source: "assets/projects/horse-riding/horse-riding-05.jpg",
    crop: { left: 0, top: 14, width: 1800, height: 1169 },
  },
  {
    canonical: "assets/art/night-fishermen-li-river.jpg",
    source: "assets/projects/travel/travel-07.jpg",
    crop: { left: 0, top: 15, width: 1800, height: 1168 },
  },
  {
    canonical: "assets/art/rice-terraces-golden-hour.jpg",
    source: "assets/projects/travel/travel-08.jpg",
    crop: { left: 0, top: 15, width: 1800, height: 1168 },
  },
  {
    canonical: "assets/art/village-elders-laughter.jpg",
    source: "assets/projects/travel/travel-11.jpg",
    crop: { left: 0, top: 15, width: 1800, height: 1168 },
  },
];

export const AUTHENTIC_ARCHIVE_SOURCES = [
  {
    canonical: "assets/archive/ricky-kwok-hku-light-pollution-award-2014.jpg",
    width: 1920,
    height: 1080,
    provenance: "genuine-local-1920x1080-television-frame",
  },
  {
    canonical: "assets/archive/ricky-kwok-student-award-presentation.jpg",
    width: 5184,
    height: 3456,
    provenance: "genuine-local-camera-original",
  },
];

export const DISPLAY_RESAMPLES = [
  {
    source: "assets/art/blue-hour-cormorant-fishermen.jpg",
    sourceSha256: "4159064dcae9671af02be8701ea91b7ae4a4a8903a760a8ec99cd39be88ad8d1",
    sourceWidth: 800,
    sourceHeight: 519,
    output: "assets/display-derivatives-v1/art/blue-hour-cormorant-fishermen-display-1600.webp",
    outputWidth: 1600,
    outputHeight: 1038,
  },
  {
    source: "assets/archive/ricky-kwok-ouhk-outstanding-student-deans-list-2017.jpg",
    sourceSha256: "47183aa59ac5cd5f6a71f1c94c300008a80fffae217dc830893f79e234ef4d86",
    sourceWidth: 1024,
    sourceHeight: 1024,
    output: "assets/display-derivatives-v1/archive/ricky-kwok-ouhk-outstanding-student-deans-list-2017-display-2048.webp",
    outputWidth: 2048,
    outputHeight: 2048,
  },
];

export const DISPLAY_RESAMPLE_METHOD = Object.freeze({
  kind: "display-resampled",
  generative: false,
  algorithm: "sharp-cubic-2x",
  crop: false,
  sharpen: false,
  denoise: false,
  webpQuality: 90,
});
