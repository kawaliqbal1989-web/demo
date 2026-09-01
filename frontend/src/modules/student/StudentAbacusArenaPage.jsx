import { StudentAbacusArenaLobby } from "./StudentAbacusArenaLobby";

function StudentAbacusArenaPage({
  basePath = "/student/virtual-abacus",
  studentProgressEnabled = true
} = {}) {
  return (
    <StudentAbacusArenaLobby
      basePath={basePath}
      studentProgressEnabled={studentProgressEnabled}
    />
  );
}

export { StudentAbacusArenaPage };
