from fastapi import APIRouter
from app.api.routes import auth, explore, portfolio

api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(portfolio.router)
api_router.include_router(explore.router)
