import { sendError, sendSuccess } from "../utils/api-response.js";

function responseFormatMiddleware(req, res, next) {
  res.apiSuccess = (message, data = null, status = 200) => sendSuccess(res, message, data, status);
  res.apiError = (status, message, errorCode = "INTERNAL_ERROR") =>
    sendError(res, status, message, errorCode);
  next();
}

export { responseFormatMiddleware };
