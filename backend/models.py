from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Byte = Annotated[int, Field(strict=True, ge=0, le=255)]
Hue = Annotated[int, Field(strict=True, ge=0, le=179)]


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    color: str = Field(default="#ffff00", pattern=r"^#[0-9a-fA-F]{6}$")
    lower_hsv: tuple[Hue, Byte, Byte] = (18, 100, 100)
    upper_hsv: tuple[Hue, Byte, Byte] = (40, 255, 255)
    min_area: int = Field(default=700, ge=1, le=1280 * 720)
    tracking: bool = True

    @model_validator(mode="after")
    def ordered_limits(self):
        if any(self.lower_hsv[i] > self.upper_hsv[i] for i in (1, 2)):
            raise ValueError("Saturation and value minimums must not exceed maximums.")
        return self


class FrameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["frame"]
    frame_id: int = Field(ge=0, strict=True)
    image: str = Field(max_length=2_800_000)
    settings: Settings = Field(default_factory=Settings)
