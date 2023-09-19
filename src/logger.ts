import { resolve } from "node:path";
import winston from "winston";
import { MessageType, type Client, type LogLevel, type RPCMessage } from "./types.ts";

export function createLogger(
    client: Client,
    logging?: { level: LogLevel; file?: string | undefined },
) {
    if (!logging) return;

    const defaultFilePath = `/tmp/${client.name}.bunvim.logs`;

    const logger = winston.createLogger({
        level: logging.level,
        transports: [
            new winston.transports.File({
                filename: defaultFilePath,
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
                    winston.format.printf((info) => `\n${info.level} ${info.timestamp}`),
                ),
            }),
            new winston.transports.File({
                filename: defaultFilePath,
                format: winston.format.combine(
                    winston.format((info) => {
                        // @ts-expect-error ts mad we delete non-optional prop `level`
                        delete info.level;
                        return info;
                    })(),
                    winston.format.prettyPrint({
                        colorize: true,
                    }),
                ),
            }),
        ],
    });

    if (logging.file) {
        const resolved = resolve(logging.file);
        logger.add(
            new winston.transports.File({
                filename: resolved,
                format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            }),
        );
    }

    return logger;
}

export function prettyRPCMessage(message: RPCMessage, direction: "out" | "in") {
    const prefix = direction === "out" ? "OUTGOING" : "INCOMING";

    if (message[0] === MessageType.REQUEST) {
        return {
            [`${prefix}_REQUEST`]: {
                reqId: message[1],
                method: message[2],
                params: message[3],
            },
        };
    }

    if (message[0] === MessageType.RESPONSE) {
        return {
            [`${prefix}_RESPONSE`]: {
                reqId: message[1],
                error: message[2],
                result: message[3],
            },
        };
    }

    // if (message[0] === MessageType.NOTIFY)
    return {
        [`${prefix}_NOTIFICATION`]: {
            event: message[1],
            args: message[2],
        },
    };
}
