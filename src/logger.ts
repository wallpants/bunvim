import { createWriteStream } from "node:fs";
import winston from "winston";

function createLogger(streamPath: string, logLevel: string) {
    if (!streamPath) {
        return winston.createLogger({
            // we must provide at least one logger or winston cries
            transports: new winston.transports.Console({ silent: true }),
        });
    }

    const stream = createWriteStream(streamPath);

    return winston.createLogger({
        level: logLevel,
        transports: [
            new winston.transports.Stream({
                stream,
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp({ format: "HH:mm:ss" }),
                    winston.format.printf((info) => `${info.level} ${info.timestamp}`),
                ),
            }),
            new winston.transports.Stream({
                stream,
                format: winston.format.combine(
                    winston.format.prettyPrint({
                        colorize: true,
                        depth: 4,
                    }),
                ),
            }),
        ],
    });
}

export const logger = createLogger("/tmp/bunvim", "verbose");
