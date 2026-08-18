import { competitionsRouter } from "../../src/routes/competitions.routes.js";

function routeLayer(method, path) {
  return competitionsRouter.stack.find(
    (layer) =>
      layer.route?.path === path &&
      Boolean(layer.route?.methods?.[method.toLowerCase()])
  );
}

function executeFirstGuard(layer, role) {
  const req = { auth: { role } };
  const output = { statusCode: null, body: null, nextCalled: false };
  const res = {
    status(statusCode) {
      output.statusCode = statusCode;
      return this;
    },
    json(body) {
      output.body = body;
      return this;
    }
  };
  const next = () => {
    output.nextCalled = true;
  };

  layer.route.stack[0].handle(req, res, next);
  return output;
}

describe("Current Competition workflow route contract", () => {
  test("obsolete Competition-request transition routes are not exposed", () => {
    expect(routeLayer("post", "/:id/forward-request")).toBeUndefined();
    expect(routeLayer("post", "/:id/reject")).toBeUndefined();
  });

  test("Teacher can forward only an enrollment list, never a direct Superadmin request", () => {
    const layer = routeLayer("post", "/:id/enrollment-lists/:listId/forward");
    expect(layer).toBeDefined();
    expect(executeFirstGuard(layer, "TEACHER")).toMatchObject({
      nextCalled: true,
      statusCode: null
    });
  });

  test("result publication and unpublication remain Superadmin-only", () => {
    for (const path of ["/:id/results/publish", "/:id/results/unpublish"]) {
      const layer = routeLayer("post", path);
      expect(layer).toBeDefined();

      expect(executeFirstGuard(layer, "SUPERADMIN").nextCalled).toBe(true);
      expect(executeFirstGuard(layer, "BP")).toMatchObject({
        nextCalled: false,
        statusCode: 403,
        body: expect.objectContaining({ error_code: "ROLE_FORBIDDEN" })
      });
      expect(executeFirstGuard(layer, "CENTER")).toMatchObject({
        nextCalled: false,
        statusCode: 403,
        body: expect.objectContaining({ error_code: "ROLE_FORBIDDEN" })
      });
    }
  });

  test("operational result reads exclude Student accounts", () => {
    for (const path of ["/:id/results", "/:id/results.csv", "/:id/leaderboard"]) {
      const layer = routeLayer("get", path);
      expect(layer).toBeDefined();

      expect(executeFirstGuard(layer, "TEACHER").nextCalled).toBe(true);
      expect(executeFirstGuard(layer, "STUDENT")).toMatchObject({
        nextCalled: false,
        statusCode: 403,
        body: expect.objectContaining({ error_code: "ROLE_FORBIDDEN" })
      });
    }
  });
});
