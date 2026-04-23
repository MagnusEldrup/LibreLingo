# pylint: disable=wrong-import-order

from librelingo_utils import calculate_number_of_levels, get_opaque_id
from slugify import slugify


def _get_module_summary(module):
    """
    Get a module summary for the course meta data
    """

    def get_imageset(images):
        if images and len(images) == 3 and all(images):
            return {"imageSet": images}
        return {}

    def get_introduction(skill):
        if skill.introduction:
            return {"introduction": f"{slugify(skill.name)}.md"}
        return {}

    def get_summary(words, phrases, custom_challenges):
        words = [word.in_target_language[0] for word in words]
        phrases = [phrase.in_target_language[0] for phrase in phrases]
        custom_summary = []

        for custom_challenge in custom_challenges:
            if custom_challenge["type"] == "grammarTable":
                if custom_challenge.get("table_title"):
                    custom_summary.append(custom_challenge["table_title"])
                custom_summary.extend(
                    row["prompt"] for row in custom_challenge["rows"][:4]
                )

        return words + phrases + custom_summary

    def get_levels(words, phrases, custom_challenges):
        return calculate_number_of_levels(
            len(words), len(phrases), len(custom_challenges)
        )

    return {
        "title": module.title,
        "skills": [
            {
                **(get_imageset(skill.image_set)),
                **(get_introduction(skill)),
                "summary": get_summary(
                    skill.words, skill.phrases, skill.custom_challenges
                ),
                "practiceHref": slugify(skill.name),
                "id": get_opaque_id(skill, "Skill"),
                "title": skill.name,
                "levels": get_levels(
                    skill.words, skill.phrases, skill.custom_challenges
                ),
            }
            for skill in module.skills
        ],
    }
