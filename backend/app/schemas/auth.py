from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
