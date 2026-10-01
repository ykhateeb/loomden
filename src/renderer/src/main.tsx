import { createRoot } from "react-dom/client";
import "./agent-messages"; // connects to the agent process
import { App } from "./App";
import { Gallery } from "./ui/Gallery";
import "./ui/theme.css";

createRoot(document.getElementById("root")!).render(location.hash.startsWith("#gallery") ? <Gallery /> : <App />);
