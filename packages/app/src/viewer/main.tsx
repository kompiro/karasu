// Entry of the gallery viewer build (`viewer.html`, #2997). The page is served
// under `Content-Security-Policy: sandbox allow-scripts …` (an opaque origin),
// with the submission embedded as JSON. See `mount-viewer.tsx`.
import { readEmbeddedSource } from "./embedded-source.js";
import { mountViewer } from "./mount-viewer.js";
import "../styles/index.css";

mountViewer(document.getElementById("root")!, { source: readEmbeddedSource(document) ?? "" });
