"""FastAPI entrypoint."""

from typing import Annotated

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_session
from routers import aggregation, communes, parametres

# Caddy strips /api before proxying here (handle_path), so FastAPI never sees it in the
# request path: root_path tells it anyway, so the generated OpenAPI/Swagger URLs are correct
# from the browser's point of view (which does see /api).
app = FastAPI(title="Ondine API", root_path="/api")
app.include_router(parametres.router)
app.include_router(aggregation.router)
app.include_router(communes.router)


@app.get("/health")
def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
    session.execute(text("SELECT 1"))
    return {"status": "ok"}
