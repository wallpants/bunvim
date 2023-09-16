import { createWriteStream } from "node:fs";
import winston from "winston";

const LOG_FILE = process.env.BUNVIM_LOG_FILE;
const LOG_LEVEL = process.env.BUNVIM_LOG_LEVEL;

export function createLogger() {
    if (!LOG_FILE) {
        return winston.createLogger({
            // we must provide at least one logger or winston cries
            transports: new winston.transports.Console({ silent: true }),
        });
    }

    const stream = createWriteStream(LOG_FILE);

    return winston.createLogger({
        level: LOG_LEVEL ?? "verbose",
        transports: [
            new winston.transports.Stream({
                stream,
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp({ format: "HH:mm:ss" }),
                    winston.format.printf((info) => `\n${info.level} ${info.timestamp}`),
                ),
            }),
            new winston.transports.Stream({
                stream,
                format: winston.format.prettyPrint({
                    colorize: true,
                    depth: 5,
                }),
            }),
        ],
    });
}
