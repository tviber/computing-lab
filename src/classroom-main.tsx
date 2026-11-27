import { render } from "@solidjs/web";
import App from "./app/App";
import "./design/index.css";
import "./design/task-status.css";

render(() => <App />, document.getElementById("root")!);
