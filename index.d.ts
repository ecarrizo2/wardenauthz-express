declare module "@ecarrizo2/wardenauthz-express" {
  import { Request, Response, NextFunction, RequestHandler } from "express";
  import { AccessCheckResult, WardenAuthClient } from "@ecarrizo2/wardenauthz-js";

  interface WardenAuthExpressOptions {
    apiUrl: string;
    apiKey: string;
    scopeExtractor?: (req: Request) => string;
    subjectExtractor?: (req: Request) => string;
    resourceExtractor?: (req: Request) => string;
    actionExtractor?: (req: Request) => string;
    contextExtractor?: (req: Request) => Record<string, unknown>;
    enrichRequest?: boolean;
  }

  interface RequestWithWardenAuth extends Request {
    accessControl?: {
      result: AccessCheckResult;
      scopeId: string;
      subjectId: string;
    };
  }

  export function accessControl(options: WardenAuthExpressOptions): RequestHandler;
}
