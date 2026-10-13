from app.prompt import build_prompt

COURSE = "Les namespaces isolent les processus. Les cgroups limitent leurs ressources."


def test_prompt_asks_for_a_range_when_bounds_differ() -> None:
    assert "Génère entre 3 et 10 flashcards" in build_prompt(COURSE, 3, 10)


def test_prompt_asks_for_an_exact_number_when_bounds_are_equal() -> None:
    prompt = build_prompt(COURSE, 5, 5)

    assert "Génère 5 flashcards" in prompt
    assert "entre 5 et 5" not in prompt


def test_prompt_puts_the_course_between_delimiters_at_the_end() -> None:
    prompt = build_prompt(COURSE, 1, 5)

    assert prompt.endswith(f"=== DÉBUT DU COURS ===\n{COURSE}\n=== FIN DU COURS ===")


def test_prompt_keeps_braces_of_the_course_unchanged() -> None:
    course = "En Java, un bloc s'écrit { ... } et une Map<String, Integer> se déclare ainsi."

    assert course in build_prompt(course, 1, 5)
