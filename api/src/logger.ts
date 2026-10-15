import { pino } from "pino";
import { config } from "./config.js";

// JSON logs on stdout, collected by the container runtime
export const logger = pino({ level: config.LOG_LEVEL });
