import jwt from "jsonwebtoken";
import {
  authHeader,
  http,
  loginAs,
  prisma
} from "../helpers/test-helpers.js";

describe("AUTH", () => {
  test("Login success", async () => {
    const response = await loginAs({
      email: "superadmin@abacusweb.local"
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.access_token).toBeTruthy();
    expect(response.body.data.refresh_token).toBeTruthy();
  });

  test("Login fail", async () => {
    const response = await loginAs({
      email: "superadmin@abacusweb.local",
      password: "wrong-password"
    });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe("INVALID_CREDENTIALS");
  });

  test("Expired access token rejection", async () => {
    const user = await prisma.authUser.findFirstOrThrow({
      where: { email: "superadmin@abacusweb.local" },
      select: {
        id: true,
        role: true,
        tenantId: true,
        hierarchyNodeId: true,
        studentId: true
      }
    });

    const expiredToken = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        tenantId: user.tenantId,
        hierarchyNodeId: user.hierarchyNodeId,
        studentId: user.studentId
      },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -1 }
    );

    const response = await http
      .get("/api/students")
      .set(authHeader(expiredToken));

    expect(response.status).toBe(401);
    expect(response.body.error_code).toBe("INVALID_ACCESS_TOKEN");
  });

  test("Refresh rotation invalidates old token", async () => {
    const loginResponse = await loginAs({
      email: "superadmin@abacusweb.local"
    });

    const refreshToken1 = loginResponse.body.data.refresh_token;

    const refreshResponse = await http.post("/api/auth/refresh").send({
      refreshToken: refreshToken1
    });

    expect(refreshResponse.status).toBe(200);
    const refreshToken2 = refreshResponse.body.data.refresh_token;
    expect(refreshToken2).toBeTruthy();
    expect(refreshToken2).not.toBe(refreshToken1);

    const reusedOldTokenResponse = await http.post("/api/auth/refresh").send({
      refreshToken: refreshToken1
    });

    expect(reusedOldTokenResponse.status).toBe(401);
    expect(reusedOldTokenResponse.body.error_code).toBe("REFRESH_TOKEN_REUSED");

    const token1Payload = jwt.decode(refreshToken1);
    const oldStoredToken = await prisma.refreshToken.findUnique({
      where: {
        tokenId: token1Payload.tokenId
      }
    });

    expect(oldStoredToken).toBeTruthy();
    expect(oldStoredToken.revokedAt).toBeTruthy();
  });
});
