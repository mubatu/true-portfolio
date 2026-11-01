from sqlalchemy.orm import Session
from app.db.models import Profile


def get_profile_by_id(db: Session, user_id: str) -> Profile | None:
    """Get a profile by user ID."""
    return db.query(Profile).filter(Profile.id == user_id).first()


def update_profile(db: Session, user_id: str, **kwargs) -> Profile | None:
    """Update a user's profile."""
    profile = get_profile_by_id(db, user_id)
    if not profile:
        return None
    
    for key, value in kwargs.items():
        if hasattr(profile, key) and value is not None:
            setattr(profile, key, value)
    
    db.commit()
    db.refresh(profile)
    return profile
