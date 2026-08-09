"""FastAPI entrypoint."""

from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_session
from routers import aggregation, communes, parametres

# Caddy strips /api before proxying here (handle_path), so FastAPI never sees it in the
# request path: root_path tells it anyway, so the generated OpenAPI/Swagger URLs are correct
# from the browser's point of view (which does see /api).
app = FastAPI(title="Ondine API", root_path="/api")

# Read-only public data (no auth, no cookies, no write endpoints), and the frontend can be
# hosted on a different origin than the backend (e.g. Render static site calling a separate
# Render web service directly, instead of Caddy's same-origin /api proxy): open CORS is a
# reasonable tradeoff here rather than tracking every deployment's frontend origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(parametres.router)
app.include_router(aggregation.router)
app.include_router(communes.router)


@app.get("/health")
def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
    session.execute(text("SELECT 1"))
    return {"status": "ok"}
