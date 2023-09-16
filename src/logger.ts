import { createWriteStream } from "node:fs";
import winston from "winston";
import { MessageType, type RPCMessage } from "./types.ts";

const LOG_FILE = process.env.BUNVIM_LOG_FILE;
const LOG_LEVEL = process.env.BUNVIM_LOG_LEVEL;

function createLogger() {
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

export const logger = createLogger();

/**
 * Transform RPCMessage to an object with named values
 */
export function prettyRPCMessage(message: RPCMessage) {
    if (message[0] === MessageType.REQUEST) {
        return {
            OUTGOING_REQUEST: {
                reqId: message[1],
                method: message[2],
                params: message[3],
            },
        };
    }

    if (message[0] === MessageType.RESPONSE) {
        return {
            OUTGOING_RESPONSE: {
                reqId: message[1],
                error: message[2],
                result: message[3],
            },
        };
    }

    return {
        OUTGOING_NOTIFICATION: {
            event: message[1],
            args: message[2],
        },
    };
}
