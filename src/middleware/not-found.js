function notFoundHandler(req, res) {
  res.apiError(404, "Route not found", "ROUTE_NOT_FOUND");
}

export { notFoundHandler };
