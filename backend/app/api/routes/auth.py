from fastapi import APIRouter
from app.schemas import UserResponse
from app.api.deps import CurrentUser

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: CurrentUser):
    """
    Get the current authenticated user's profile.
    Requires a valid Supabase JWT token in Authorization header.
    """
    return current_user
