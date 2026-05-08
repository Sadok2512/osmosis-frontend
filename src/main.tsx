// Side-effect import: install the crypto.randomUUID v4 fallback before any
// app code runs. The frontend is served over plain HTTP at
// http://185.248.33.125:3000/, which Firefox / Safari treat as an insecure
// context — they leave crypto.randomUUID undefined and the app crashes
// with "crypto.randomUUID is not a function" on first ID generation.
// Must stay at the top of main.tsx so the polyfill lands before any
// of the 19+ call sites in src/* fire.
import "./lib/cryptoPolyfill";

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
