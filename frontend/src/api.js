const BASE = "/api";

async function request(path, options = {}) {
  const resp = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `请求失败（${resp.status}）`);
  }
  return data;
}

export const api = {
  listMaterials: () => request("/materials"),
  createMaterial: (payload) =>
    request("/materials", { method: "POST", body: JSON.stringify(payload) }),
  getMaterial: (id) => request(`/materials/${id}`),
  createVersion: (materialId, payload) =>
    request(`/materials/${materialId}/versions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getVersion: (id) => request(`/versions/${id}`),
  listComments: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    return request(`/comments${qs ? `?${qs}` : ""}`);
  },
  createComment: (versionId, payload) =>
    request(`/versions/${versionId}/comments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCommentStatus: (id, payload) =>
    request(`/comments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  listDispositions: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    return request(`/dispositions${qs ? `?${qs}` : ""}`);
  },
  listAudits: () => request("/audits"),
  riskSummary: (materialId) =>
    request(`/risk-summary${materialId ? `?material_id=${materialId}` : ""}`),
};
