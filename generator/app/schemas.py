from pydantic import BaseModel, ConfigDict, Field


class GenerateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(
        min_length=50,
        max_length=20_000,
        description="Course text used to generate the flashcards.",
        examples=[
            "Un conteneur est un processus isolé du reste du système grâce aux namespaces "
            "du noyau Linux. Les cgroups limitent les ressources qu'il peut consommer."
        ],
    )
    count: int = Field(
        default=5, ge=1, le=30, description="Maximum number of flashcards to generate."
    )


class Card(BaseModel):
    front: str = Field(min_length=1)
    back: str = Field(min_length=1)


class GenerateResponse(BaseModel):
    cards: list[Card]
