from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(
    title="ZAYQORA by VIRELEO API",
    description="Multi-tenant restaurant management SaaS backend (FastAPI + SQLAlchemy + PostgreSQL + Redis)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TenantConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, tenant_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.rooms.setdefault(tenant_id, []).append(websocket)

    def disconnect(self, tenant_id: str, websocket: WebSocket) -> None:
        if tenant_id in self.rooms and websocket in self.rooms[tenant_id]:
            self.rooms[tenant_id].remove(websocket)

    async def broadcast(self, tenant_id: str, event: dict) -> None:
        for ws in list(self.rooms.get(tenant_id, [])):
            await ws.send_json(event)


manager = TenantConnectionManager()


from app.routers.restaurants import router as zayqora_router

app.include_router(zayqora_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "zayqora-fastapi"}


@app.post("/api/tenants/{restaurant_id}/media/presign")
async def presign_media_upload(
    restaurant_id: str,
    asset_kind: str = "menu_item",
    content_type: str = "image/jpeg",
) -> dict[str, str]:
    from app.storage import create_tenant_presigned_upload

    return create_tenant_presigned_upload(
        restaurant_id=restaurant_id,
        asset_kind=asset_kind,  # type: ignore[arg-type]
        content_type=content_type,
    )


@app.websocket("/ws/tenants/{tenant_id}")
async def tenant_ws(websocket: WebSocket, tenant_id: str) -> None:
    await manager.connect(tenant_id, websocket)
    try:
        while True:
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(tenant_id, websocket)
