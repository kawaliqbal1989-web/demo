import { apiClient } from "./apiClient";

async function uploadMyLogo(file, { onProgress } = {}) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post("/uploads/logo", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    },
    _skipGlobalLoading: true,
    onUploadProgress: (event) => {
      if (!event?.total || typeof onProgress !== "function") {
        return;
      }

      onProgress(Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100))));
    }
  });

  return response.data;
}

async function deleteMyLogo() {
  const response = await apiClient.delete("/uploads/logo", {
    _skipGlobalLoading: true
  });

  return response.data;
}

export { uploadMyLogo, deleteMyLogo };