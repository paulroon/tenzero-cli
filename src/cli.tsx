import React from "react";
import { render } from "ink";
import App from "@/ui/App";
import { setInkInstance } from "@/lib/inkInstance";

const instance = render(<App />);
setInkInstance(instance);
