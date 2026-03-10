import { Toaster } from "react-hot-toast";
import { AppRouter } from "../routes/AppRouter";

function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <AppRouter />
    </>
  );
}

export { App };
