import unittest

from tools.dictionary.build_dictionary_v2 import (
    arpabet_to_ipa,
    parse_forms,
    parse_senses,
    quality_score,
)


class DictionaryV2Tests(unittest.TestCase):
    def test_senses_group_by_part_of_speech_and_domain(self):
        senses = parse_senses("n. 能力；才干\\nv. 能够\\n[计] 处理能力\\n[网络] 阿比利提")
        self.assertEqual(senses[0].pos, "n.")
        self.assertEqual(senses[0].meanings, ["能力", "才干"])
        self.assertEqual(senses[1].pos, "v.")
        self.assertEqual(senses[2].domain, "计算机")
        self.assertNotIn("阿比利提", [meaning for sense in senses for meaning in sense.meanings])

    def test_exchange_codes_become_readable_forms(self):
        self.assertEqual(
            parse_forms("p:went/d:gone/i:going/3:goes"),
            [("过去式", "went"), ("过去分词", "gone"), ("现在分词", "going"), ("第三人称单数", "goes")],
        )

    def test_arpabet_conversion_keeps_stress(self):
        self.assertEqual(arpabet_to_ipa(["AH0", "B", "IH1", "L", "AH0", "T", "IY0"]), "əbˈɪləti")

    def test_common_tagged_word_scores_above_unranked_word(self):
        senses = parse_senses("n. 能力")
        common, _ = quality_score({"word": "ability", "oxford": "1", "tag": "ielts", "bnc": "946", "frq": "783"}, senses)
        rare, _ = quality_score({"word": "abilityish", "oxford": "", "tag": "", "bnc": "0", "frq": "0"}, senses)
        self.assertGreater(common, rare)


if __name__ == "__main__":
    unittest.main()
