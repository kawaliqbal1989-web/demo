function sendSuccess(res, message, data = null, status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
    error_code: null
  });
}

function sendError(res, status, message, errorCode = "INTERNAL_ERROR") {
  return res.status(status).json({
    success: false,
    message,
    data: null,
    error_code: errorCode
  });
}

export { sendSuccess, sendError };
