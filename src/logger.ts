import { resolve } from "node:path";
import { inspect } from "node:util";
import winston from "winston";
import { MessageType, type Client, type LogLevel, type RPCMessage } from "./types.ts";

export function createLogger(
   client: Client,
   logging?: { level?: LogLevel | undefined; file?: string | undefined },
) {
   if (!logging?.level) return;

   const defaultFilePath = `/tmp/${client.name}.bunvim.logs`;

   const logger = winston.createLogger({
      level: logging.level,
      transports: [
         new winston.transports.File({
            filename: defaultFilePath,
            format: winston.format.combine(
               winston.format.colorize(),
               winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
               winston.format.printf((info) => {
                  // Object.entries drops winston's internal Symbol props
                  const body = Object.fromEntries(
                     Object.entries(info).filter(([key]) => key !== "level" && key !== "timestamp"),
                  );
                  const level = info.level;
                  const timestamp = String(info["timestamp"]);
                  return `\n${level} ${timestamp}\n${inspect(body, { colors: true, depth: null })}`;
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
         [`${prefix}_RPC_REQUEST`]: {
            reqId: message[1],
            method: message[2],
            params: message[3],
         },
      };
   }

   if (message[0] === MessageType.RESPONSE) {
      return {
         [`${prefix}_RPC_RESPONSE`]: {
            reqId: message[1],
            error: message[2],
            result: message[3],
         },
      };
   }

   // if (message[0] === MessageType.NOTIFY)
   return {
      [`${prefix}_RPC_NOTIFICATION`]: {
         event: message[1],
         args: message[2],
      },
   };
}
