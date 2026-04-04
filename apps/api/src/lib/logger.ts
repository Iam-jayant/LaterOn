import winston from "winston";

const logLevel = process.env.LOG_LEVEL ?? "info";

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
    })
  ]
});

export const logBlockchainTransaction = (params: {
  operation: string;
  txId: string | undefined;
  sender: string;
  appId?: number;
  amount?: number;
}): void => {
  if (!params.txId) {
    return; // Skip logging if no transaction ID
  }
  
  logger.info("Blockchain transaction submitted", {
    operation: params.operation,
    txId: params.txId,
    sender: params.sender,
    appId: params.appId,
    amount: params.amount
  });
};
