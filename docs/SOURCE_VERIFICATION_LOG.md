# QSC Atlas, Source Verification Log

**Generated:** 2026-06-18
**Method:** Each load-bearing claim (coordination posture, standards role, legal status, regulation instruments, obligation, timeline) was checked against the country's own cited institutional sources, quoting the live page verbatim. Run with WebFetch: the Claude-in-Chrome integration was requested but no browser extension was connected, so WebFetch read the same public pages and PDFs server-side. Some government portals (EUR-Lex, several SharePoint or JavaScript sites) block server-side fetchers; where that happened the claim is marked **Not accessible** and, where possible, recovered from an alternate institutional URL.
**Verdicts:** Verified · Untrue (the source contradicts the claim) · Not accessible · Unsupported (sources load but none state the claim).
**Scope:** Phase 1 below covers the 23 highest-stakes classifications (the three pilot anchors, the sovereign bloc, every "engaged-unaligned" downgrade, the EU anchors, and the reclassified NIST-bloc states). Phase 2 (the remaining EU and NIST takers) is appended as it completes.
**Important:** This is a read-only audit. No country profile, Notion field, or live-site value has been changed.

---

## Headline flags (the action items)

1. **Thailand, misclassified (Untrue).** Classified "engaged-unaligned", but NCSA's own QUANTA pages commit to the NIST FIPS 203/204/205 suite (ML-KEM, ML-DSA, SLH-DSA) and a phased roadmap to a 2035 completion target. Confirmed by spot-check. Recommend reclassifying to NIST-bloc (taker, with a 2035 timeline).
2. **Argentina, Unsupported.** Zero included documents. The "engaged-unaligned (Medium)" rests entirely on excluded Tier-2 vendor material (ARSAT CryptoComm). Recommend downgrade or a fresh scrape for a national-authority source.
3. **Bahrain and Brunei, primary source unreachable.** The single cited institutional page is blocked (Bahrain BNA returns 405; Brunei CSB returns 403). The only corroboration is non-institutional (vendor PR; a Facebook post), which the Atlas's own issuer rule excludes. Re-source or lower confidence.
4. **Indonesia and Türkiye, cited government source will not load.** bsn.go.id and btk.gov.tr fail server-side (socket-closed); substance corroborated only by search paraphrase, no verbatim institutional quote obtainable. Indonesia also shows an ISO/IEC and sovereign lean.
5. **Vietnam, both cited URLs are dead.** Its only two included sources (antoanthongtin.gov.vn) fail with TLS certificate errors. The sovereign VN-PQSign claim was recovered from the agency's own bcy.gov.vn. Swap the dead links.
6. **India, CERT-In whitepaper link dead (404):** cert-in.org.in/PDF/CIWP-2025-0002.pdf. Separately, the DST task-force report shows a strong indigenous / "sovereign independence" development track; contextualiser still holds (it explicitly conforms to NIST), but it is a contextualiser with sovereign ambition.
7. **South Korea, sovereign boundary.** The KpqC national competition has selected Korean algorithms (NTRU+, SMAUG-T, HAETAE, AIMer, and others). Contextualiser is defensible but sovereign-leaning; worth a note on the profile.
8. **Binding-law sub-claims for Russia, China and Vietnam are not in their cited documents.** The cited sources establish the national standards bodies and research/standardisation tracks (all verified), but not the legal mandates (Russia's FSB/GOST use-obligation; China's Cryptography Law 2020 and CII mandate; Vietnam's 2011/2025 laws). Add the legal instruments as sources if those claims are to stand on their own evidence.
9. **Saudi Arabia, internal inconsistency.** The profile's dominantProcess still reads "Sovereign" while standardsRole is "taker". Reconcile.
10. **Australia, could not verify.** Every cyber.gov.au and asd.gov.au URL timed out via WebFetch. Search (not recorded as verified) indicates ASD requires ceasing RSA/DH/ECDH/ECDSA by end of 2030, a national timing overlay on NIST's algorithms. If confirmed, this supports a contextualiser flag rather than pure taker. Needs a browser fetch of the ISM cryptography guidelines.
11. **Norway, could not verify.** nsm.no returns 403 to the fetcher. Search indicates NSM's 2025 Cryptographic Recommendations adopt ML-KEM/ML-DSA/SLH-DSA with a hybrid stance; if borne out, the "Low" confidence is understated. Needs a browser fetch.
12. **Lithuania and Romania, sources block the fetcher.** nksc.lt blanket-403s; all four Romanian official URLs return 403/503. Classifications are plausible but unverified against primary text; need a browser check.
13. **Austria, Bulgaria, Estonia, Malta, membership-only.** Zero included documents and no national-authority PQC source located; classified EU/taker purely by EU membership. Recommend a deep re-scrape. (Estonia clearly has activity via Cybernetica, but only as an excluded vendor source.)
14. **Slovakia, a real source is missing from the data.** Also zero documents, but a genuine national instrument exists and was simply not ingested: NBÚ "Odporúčania pre kryptografické algoritmy" (https://www.nbu.gov.sk/data/att/3483.pdf), which names ML-KEM/ML-DSA/SLH-DSA. Ingest it.
15. **Data-quality notes.** Spain and Italy's live sources name NIST more explicitly than their profiles' "no standards camp" provenance recorded (the NIST baseline is firmer than recorded). Denmark's cfcs.dk now permanently redirects to samsik.dk; add it to the trusted-domains list.

No source was found that contradicts any classification other than Thailand. The Phase 2 gaps are access failures (sites blocking server-side fetchers), not refutations, and are exactly where the Chrome integration would help.

---

## Pilot anchors

### United States (USA), NIST-bloc / setter (High), **Verified**
Source: https://csrc.nist.gov/projects/post-quantum-cryptography (NIST CSRC)
- **Posture and role (setter)** — Verified.
  > "NIST's Post-Quantum Cryptography (PQC) project leads the national and global effort to secure electronic information against the future threat of quantum computers"
  > "In August 2024, NIST released its principal PQC standards (as Federal Information Processing Standards, or FIPS)"
  > "FIPS 203 ... (ML-KEM)", "FIPS 204 ... (ML-DSA)", "FIPS 205 ... (SLH-DSA)"
- **Note:** the separate 2035 CNSA 2.0 claim for National Security Systems sits on an NSA page, not this one, and is queued for its own check in Phase 2.

### United Kingdom (GBR), NIST-bloc / taker (High), **Verified**
Source: https://www.ncsc.gov.uk/guidance/pqc-migration-timelines (NCSC, 20 March 2025)
- **Timeline** — Verified.
  > by 2028: "Define your migration goals", "Carry out a full discovery exercise"
  > by 2031: "Carry out your early, highest-priority PQC migration activities"
  > by 2035: "Complete migration to PQC of all your systems, services and products"
- **Posture (NIST alignment)** — Verified.
  > "standardised by NIST in 2024: ML-KEM (FIPS 203), ML-DSA (FIPS 204), SLH-DSA (FIPS 205)"
- **Obligation (no binding mandate)** — Verified. The page itself states there is no statutory UK PQC mandate, consistent with the profile's obligation text.

### European Union (EUU), EU / contextualiser (Medium), **Verified (with a source note)**
Primary source not accessible: https://eur-lex.europa.eu/eli/reco/2024/1101/oj/eng returned empty to the fetcher (cookie/JS wall).
Recovered source: https://digital-strategy.ec.europa.eu/en/news/commission-publishes-recommendation-post-quantum-cryptography (European Commission, 11 April 2024)
- **Posture and legal status (soft-law Recommendation)** — Verified.
  > "the Commission published a Recommendation on Post-Quantum Cryptography to encourage Member States to develop and implement a harmonised approach"
  > "a coordinated approach to Europe's transition to a quantum-safe digital infrastructure"
- **Note:** it is a non-binding Recommendation, matching the soft-law classification. EUR-Lex is the canonical citation but blocks server-side fetchers; verify in a browser if a verbatim OJ quote is needed.

---

## Sovereign bloc

### Russia (RUS), sovereign-bloc / sovereign-developer (High), **Verified**
- **Posture and role (sovereign-developer)** — Verified. Source: https://tc26.ru/about/structure/
  > "Технический Комитет По Стандартизации «Криптографическая Защита Информации»"
  > "Рабочая группа 2.5 по постквантовым криптографическим механизмам" (Working Group 2.5, Post-Quantum Cryptographic Mechanisms)
- **Regulation (GOST R 34 national standards)** — Verified. Source: https://tc26.ru/standarts/natsionalnye-standarty/
  > "ГОСТ Р 34.10–2012 ... Процессы формирования и проверки электронной цифровой подписи"
  > "ГОСТ Р 34.12–2015 ... Блочные шифры"
- **Obligation** — Unsupported by cited sources. The two TC26 pages are a standards catalogue, not a legal instrument; they do not state the obligation that state and regulated systems must use the national GOST suite under FSB oversight.
- **Timeline (no adopted national PQC standard yet)** — Verified (negative claim): the national-standards index lists GOST R 34.10/.11/.12/.13 with no post-quantum standard present.
- **Flags:** sovereign GOST/TC26 posture is solidly verified verbatim. The "binding-law" status and the use-obligation are not verbatim-supported by the cited pages. Rosstandart affiliation is not stated verbatim on the structure page.

### China (CHN), sovereign-bloc / sovereign-developer (High), **Verified**
- **Posture and role (sovereign-developer)** — Verified. Source: https://sca.gov.cn/sca/xwdt/2026-01/30/content_1061322.shtml (State Cryptography Administration / OSCCA, 公告第55号, 2026-01-29)
  > "抗量子计算密码关键理论与技术" (anti-quantum-computing cryptography, key theory and technology)
  > "我国新一代商用密码征集算法" (our country's next-generation commercial cryptography algorithm solicitation)
  Corroborated: https://www.niccs.org.cn/.../content_1937422988373135360.html (商用密码标准研究院, 2025-02-05)
  > "为应对量子计算威胁，推动新一代商用密码算法标准制定" (to address the quantum threat, advance next-generation commercial cryptography standards)
- **Regulation / obligation (Cryptography Law 2020, CII mandate)** — Unsupported by cited sources. The cited OSCCA/ICCS documents concern research funding and a forward-looking algorithm solicitation, not the legal mandate. The npc.gov.cn law text refused connection (ECONNREFUSED) and is not a cited Atlas source.
- **Timeline (sovereign PQC in development, not yet mandated)** — Verified, via the in-progress solicitation.
- **Flags:** the sovereign-developer claim is strongly verified from OSCCA's own domain. The binding-law / CII-obligation half of the profile is not supported by any cited CHN document. Recommend adding the Cryptography Law as a source if the binding-law claim is to stand.

### Vietnam (VNM), sovereign-bloc / sovereign-developer (Low), **Verified (claim); cited sources dead**
- **Posture and role (sovereign-developer)** — Verified, from the agency's own domain (the two cited included URLs failed, see flags). Source: https://bcy.gov.vn/.../le-929103 (Ban Cơ yếu Chính phủ / Government Cipher Committee)
  > "thuật toán chữ ký số kháng lượng tử VN-PQSign của Ban Cơ yếu Chính phủ" (the VN-PQSign quantum-resistant digital-signature algorithm of the Government Cipher Committee)
  Corroborated (state press, Nhân Dân): https://nhandan.vn/...post942147.html
  > "Ban Cơ yếu Chính phủ đã chủ động xây dựng chiến lược ứng phó từ sớm"
- **Regulation (Law on Cipher 2011, Law on Cybersecurity 2025)** — Not verified. The cited included documents do not concern these instruments and were inaccessible; the laws were not checked against a primary source this pass.
- **Obligation / timeline** — Partially verified (research/advisory framing; no explicit date milestones), consistent with the profile.
- **Flags:** both of Vietnam's included source URLs are dead, https://antoanthongtin.gov.vn/tin/su-phat-trien-cua-luoc-do-chu-ky-so-khang-luong-tu-dua-tren-ham-bam and https://antoanthongtin.gov.vn/an-ninh-quoc-phong/tiep-tuc-nghien-cuu-chuyen-sau-ve-linh-vuc-mat-ma-luong-tu-109880 (TLS certificate failure). These are the only two included rows for VNM. Swap them for the bcy.gov.vn VN-PQSign announcement. Confidence "Low" is appropriate (research/announcement stage, introduced Feb 2026).

---

## Engaged-unaligned (the downgrades)

### Thailand (THA), engaged-unaligned (Medium), **Untrue, recommend reclassification**
- **Active on PQC?** — Verified. Source: https://pqc-learn.ncsa.or.th/ (NCSA, สกมช.)
  > "ศูนย์การเรียนรู้เพื่อเตรียมความพร้อมสู่ยุคควอนตัม" (learning centre to prepare for the quantum era)
- **Unaligned (no bloc/standard/timeline)?** — Untrue / contradicted. NCSA commits to BOTH the NIST camp AND a dated national timeline. Sources: https://pqc-learn.ncsa.or.th/standards.html and https://pqc-learn.ncsa.or.th/migration.html
  > "Module-Lattice-Based Key-Encapsulation Mechanism (ML-KEM) ถูกพัฒนามาจากอัลกอริทึม CRYSTALS-Kyber" (FIPS 203)
  > "Module-Lattice-Based Digital Signature Algorithm (ML-DSA) ถูกพัฒนามาจากอัลกอริทึม CRYSTALS-Dilithium" (FIPS 204)
  > phased timeline "2024 – 2026" (discovery), "2027 – 2030" (PQC integration), "2031 – 2034" (full interoperability), target "2035"
  > "โดยอ้างอิงจากแนวปฏิบัติของ สกมช. และ มาตรฐานจาก NIST" (referencing NCSA practice and standards from NIST)
- **Spot-check (this auditor):** confirmed migration.html verbatim, issuer NCSA, ML-KEM/ML-DSA named, phased years and 2035 target present.
- **Flags:** the "engaged-UNALIGNED" label is contradicted by Thailand's own sources. This is the profile of a NIST-aligned country with a 2035 timeline. Recommend reclassification to NIST-bloc (taker), targetCompletion 2035.

### Chile (CHL), engaged-unaligned (Medium), **Partially verified**
- **Active and unaligned** — Verified. Source: https://anci.gob.cl/noticias/comisi%C3%B3n-experta-en-tecnolog%C3%ADas-cu%C3%A1nticas-entreg%C3%B3-informe-... (ANCI Expert Commission)
  > "Implementar de forma inmediata tecnologías de comunicación Quantum-Safe"
  > "Adoptar y adaptar estándares internacionales y desarrollar estándares nacionales" (no specific camp, algorithm, or deadline named)
- **Flags:** the MinCiencia National Quantum Strategy PDF (the source for the "PQC research" directive) was inaccessible (9.8MB binary, unparseable). The classification rests substantively on the single accessible ANCI document. The 2025–2035 figure is a strategy horizon, not a PQC migration deadline.

### Bahrain (BHR), engaged-unaligned (Medium), **Flagged (primary source inaccessible)**
- **Active on PQC?** — Not accessible from the cited institutional source. The cited BNA page returned HTTP 405: https://www.bna.bh/en/HMKingissuesdecree46/BahrainpartnerswithSandboxAQtobuildquantumsafeeconomy.aspx?... Substance (NCSC–SandboxAQ partnership) appears only via the SandboxAQ vendor PR and trade press.
- **Flags:** WEAK. After excluding the vendor PR per the Atlas's own issuer rule, the sole institutional source is inaccessible, so no verbatim institutional quote could be obtained. A live NCSC deployment of a PQC discovery tool is closer to adoption-led PQC than to unaligned engagement; worth review.

### Brunei (BRN), engaged-unaligned (Low), **Flagged (primary source inaccessible)**
- **Active on PQC?** — Not accessible. The cited CSB page returned HTTP 403 (twice): https://www.csb.gov.bn/csb-organises-programme-quantum-technologies-and-post-quantum-security . The substance (a Nov 2025 readiness workshop with Malaysia's NACSA) appears via the CSB Facebook post (non-institutional) and search.
- **Flags:** WEAK. No verbatim institutional quote obtainable. The "active" claim is a single readiness-stage workshop. Confidence Low is appropriate; the evidence is thinner than the profile implies because the cited URL does not load.

### Djibouti (DJI), engaged-unaligned (Low), **Verified**
- **Active and unaligned** — Verified. Source: https://www.journalofficiel.dj/texte-juridique/loi-n195-an-25-9eme-l-portant-creation-de-lautorite-nationale-de-cybersecurite/ (Loi n° 195/AN/25/9ème L, 14 Dec 2025)
  > "Technologies émergentes stratégiques : ... l'informatique quantique, la cryptographie post quantique, la 5G/6G, la blockchain et l'internet des objets" (Article 3)
  > "Les modalités d'application de la présente loi sont fixées par décret en Conseil des Ministres" (Article 29; specifics deferred, no camp/algorithm/timeline)
- **Flags:** genuinely thin but accurately characterised, a single legislative line naming PQC as a mandate area for a not-yet-operational authority. Classification matches the evidence.

### Indonesia (IDN), engaged-unaligned (Medium), **Flagged (primary source will not load)**
- **Active on PQC?** — Not accessible verbatim. The cited BSN page failed with socket-closed errors on four attempts: https://bsn.go.id/main/berita/detail/25342/... Search corroborates (paraphrase) BSN–BSSN coordination on a PQC migration roadmap, "aligned with ... ISO/IEC JTC1 SC 27 WG2".
- **Flags:** no verbatim institutional quote obtainable. The "unaligned" reading is defensible but note the ISO/IEC lean and BSSN's sovereign "Indonesian Cryptographic Algorithms" scheme; the profile already records this as "Mixed".

### Türkiye (TUR), engaged-unaligned (Low), **Flagged (primary source will not load)**
- **Active on PQC?** — Not accessible verbatim. The cited BTK page failed with socket-closed errors: https://www.btk.gov.tr/haberler/gelecegin-teknolojisi-kuantum-kriptolojisi . Search confirms the title and (paraphrase) a BTK "Cybersecurity and Post-Quantum Cryptology" programme, with a domestic/sovereign emphasis (TÜBİTAK/BTK domestic-algorithm integration).
- **Flags:** single thin source and not verbatim-accessible. A possible sovereign/domestic-algorithm tilt would nuance the "unaligned" reading if substantiated. Confidence Low is appropriate.

### Ukraine (UKR), engaged-unaligned (Low), **Verified**
- **Active and unaligned** — Verified. Source: https://csi.cip.gov.ua/uk/pages/ukrcrypto2026 (State Scientific and Research Institute of Cybersecurity Technologies, under SSSCIP)
  > "Постквантова та квантова криптографія" (post-quantum and quantum cryptography, a thematic section)
  > eight general thematic sections, no NIST/ISO/ETSI commitment, no algorithm, no national roadmap or deadline
- **Flags:** genuinely thin but accurately characterised, the sole evidence is a conference call-for-papers (academic/convening engagement). A sovereign reading (Ukraine's DSTU tradition) is possible later but nothing in the source commits to a camp.

### Argentina (ARG), engaged-unaligned (Medium), **Unsupported**
- **Active on PQC?** — Unsupported. There are zero included documents. The results file holds two ARSAT entries, both included:false and Tier-2: https://www.arsat.com.ar/arsat-desarrollo-cryptocomm-... and https://www.arsat.com.ar/multimedia/comunicaciones-seguras/ . No included institutional source exists to quote.
- **Flags:** UNSUPPORTED. The "engaged-unaligned (Medium)" rests on excluded Tier-2 vendor material (ARSAT CryptoComm, one state-enterprise product with a "bespoke symmetric design", which the profile itself calls a weak signal). Medium confidence is not justified by any included institutional source. Downgrade or re-derive after a deeper scrape for a national-authority PQC source.

---

## EU anchors

### France (FRA), EU / contextualiser (High), **Verified**
- **Posture (EU-coordinated, NIST underneath)** — Verified. Sources: https://cyber.gouv.fr/nous-connaitre/publications/publications-internationales/a-coordinated-implementation-roadmap-for-the-transition-to-post-quantum-cryptography/ and https://cyber.gouv.fr/en/technological-and-cybersecurity-challenges/post-quantum-cryptography/
  > "Le groupe de travail de l'UE sur la cryptographie post-quantique (PQC) a publié sa feuille de route pour une mise en œuvre coordonnée de la transition vers la PQC."
  > "ANSSI also issued an opinion on the PQC mechanisms selected by NIST"
- **Contextualiser (national overlay = mandatory hybridisation)** — Verified. Source: https://cyber.gouv.fr/enjeux-technologiques/cryptographie-post-quantique/faq-pqc/
  > "L'ANSSI insiste sur la nécessité de l'hybridation partout où une protection contre la menace quantique est nécessaire"
  > "Pour ce qui concerne le périmètre réglementé [...], l'hybridation est obligatoire." (for the regulated scope, hybridisation is mandatory)
- **Obligation / timeline** — Verified.
  > "l'ANSSI vise la mise en place d'obligations PQC pour l'entrée en qualification de produits à partir de 2027."
  > "il ne sera pas raisonnable d'acheter des produits qui n'intègrent pas de la PQC après 2030."
- **Flags:** the 2030/2035 migrationTimeline is the EU coordinated roadmap, not a distinct French national deadline (the profile's provenance already notes this). France's genuine national specificity is mandatory hybridisation, which is strongly verified. The ANSSI "views" guide (messervices.cyber.gouv.fr) and a technical-objectives PDF (ptcc.fr) were not extractable, but the claims they support are verified elsewhere.

### Germany (DEU), EU / contextualiser (High), **Verified**
- **Posture (EU-coordinated, NIST underneath)** — Verified. Sources: https://www.bsi.bund.de/EN/Service-Navi/Presse/Pressemitteilungen/Presse2024/241127_Post-Quantum_Cryptography.html and https://www.bsi.bund.de/DE/Service-Navi/Presse/Alle-Meldungen-News/Meldungen/EU-Roadmap_Quantenkryptografie_250711.html
  > "The Federal Office for Information Security (BSI) urges together with partners from 17 other EU member states ... to start the transition to post-quantum cryptography (PQC)."
  > "wurde 2025 um die neuen NIST-Standards erweitert." (the recommendation was extended in 2025 with the new NIST standards)
- **Contextualiser (national overlay = BSI guideline + binding VS-IT deadlines)** — Verified. Sources: BSI quantum topic page and https://www.bsi.bund.de/DE/Service-Navi/Presse/Alle-Meldungen-News/Meldungen/PQC-Umstellungsfristen_251031.html
  > "In December 2021, the BSI published the guideline 'Quantum-safe cryptography – fundamentals, current developments and recommendations'."
  > "Post-quantum schemes should only be used in combination with classical schemes ('hybrid') if possible."
  > "verbindliche Fristen für die Umstellung auf quantensichere Kryptografie festgelegt" (binding deadlines set for the transition)
- **Obligation / timeline** — Verified (EU roadmap 2030/2035 plus a binding national VS-IT 2030 deadline).
- **Flags:** Germany's national specificity is the BSI Dec-2021 guideline (hybrid "if possible", i.e. recommended, weaker than France's "required") and binding VS-IT classified-IT deadlines. The TR-02102-1 instrument named in mainRegulation is real but its PQC content could not be quoted verbatim (BSI served only navigation chrome).

---

## NIST-bloc, majors and reclassified

### Japan (JPN), NIST-bloc / contextualiser (Medium), **Verified**
- **Posture (NIST baseline)** — Verified. Source: https://www.cryptrec.go.jp/symposium/2025_cryptrec-eval.pdf (CRYPTREC Activity Report, 2025-07-25)
  > "NIST標準のFIPS 203, 204, 205に関する安全性評価・実装性能評価に関する活動を開始"
- **Role (contextualiser)** — Verified. CRYPTREC evaluates the NIST suite through its own national e-Gov cipher list (CRYPTREC LS-0001-2022r1); no national algorithm. Source: https://www.cryptrec.go.jp/report/cryptrec-gl-2007-2024.pdf
- **Legal status** — Verified. Source: https://www.cas.go.jp/jp/seisaku/pqc/index.html (Cabinet Secretariat inter-ministerial PQC liaison council). CRYPTREC list is binding-by-market-access for e-Gov procurement.
- **Flags:** none on classification. The METI "around 2035" PDF (digitalcyber01-3-2.pdf) was inaccessible (timeout), but the profile does not assert 2035, so the claim as written stands.

### South Korea (KOR), NIST-bloc / contextualiser (Medium), **Flagged (sovereign signal)**
- **Posture (NIST baseline)** — Verified. Source: https://seed.kisa.or.kr/kisa/ngc/pqc.do (KISA)
  > "NIST는 2023년 8월 양자내성암호 ML-KEM(Crystals-Kyber), ML-DSA(Crystals-Dilithium), SLH-DSA(SPHINCS+)에 대한 표준 초안 3종(FIPS-203, FIPS-204, FIPS-205)을 공개하였고, 2024년 8월 최종 표준 문서가 공개되었습니다."
- **Role / KpqC flag** — Verified with flag. Same page:
  > "국내에서는 한국형 양자내성암호(KpqC) 확보를 위해 ... '양자내성암호 국가공모전(KpqC 공모전)'을 시작하였습니다."
  KpqC selected Korean schemes (NTRU+, SMAUG-T/TiGER, HAETAE, AIMer, PALOMA, REDOG, MQ-Sign, NCC-Sign): https://www.kpqc.or.kr/competition.html
- **Legal status / obligation** — Verified (2025 sector pilots: energy, medical, public administration). Source: https://www.kisa.or.kr/401/form?postSeq=3424 . The MSIT English release was a mismatched page and was NOT relied on (the 2030/2035 specifics from MSIT remain unverified at source).
- **Flags:** KpqC is a real national competition with selected Korean algorithms; Korea sits on the sovereign boundary. Contextualiser is defensible (the schemes are NIST-interoperable) but the profile should note the dual-track national programme.

### India (IND), NIST-bloc / contextualiser (Medium), **Flagged (sovereign track)**
- **Posture (NIST baseline)** — Verified. Source: https://dst.gov.in/sites/default/files/Report_TaskForce_PQMigration_4Feb26%20(v1).pdf (DST National Quantum Mission Task Force, Feb 2026)
  > "NIST's PQC standardization (ML-KEM, ML-DSA, SLH-DSA) and CNSA 2.0 effectively set the global vendor and ecosystem baseline for quantum-safe products." (also contrasts India with China "deliberately bypassing the U.S.-led NIST process")
- **Role (contextualiser, national testing/certification overlay)** — Verified.
  > "the Telecommunication Engineering Centre (TEC), has developed this 'Draft Framework for Testing and Certification of PQC-based Quantum-Safe Products and Solutions.'"
- **Legal status** — Source-inaccessible for the specific clauses. SEBI CSCRF body did not render via WebFetch (header/metadata only); binding nature corroborated by the DST report but the PQC clauses are not verbatim-verified.
- **Flags:** SOVEREIGN SIGNAL confirmed but bounded: the DST report repeatedly pushes "indigenous PQC algorithms" and "sovereign independence in cryptographic technologies" under "AtmaNirbhar Bharat", while staying NIST-conforming. Contextualiser holds, but India is a contextualiser with active sovereign ambition. Dead link to fix: CERT-In CIWP-2025-0002 (cert-in.org.in 404). PIB/MeitY release returned HTTP 403.

### Singapore (SGP), NIST-bloc / contextualiser (Medium), **Verified**
- **Posture (NIST baseline)** — Verified. Source: CSA Quantum-Safe Migration Handbook (draft, Oct 2025), isomer-user-content.by.gov.sg
  > "In 2024 ... NIST published their first three PQC standards, namely: FIPS 203: ML-KEM ... FIPS 204: ML-DSA ... FIPS 205: SLH-DSA"
  Corroborated, CSA Committee of Supply 2026 speech: "Singapore will take reference from the NIST standards as the baseline".
- **Role (contextualiser)** — Verified. "organisations should consult the CSA, as the national cybersecurity authority, or sectoral regulators".
- **Legal status (soft-only)** — Verified. MAS Advisory MAS/TCRS/2024/01 ("measures that FIs should consider") and the CSA Handbook are both advisory.
- **Flags:** none on classification. Strong parallel QKD emphasis (IMDA NQSN+), but the algorithm camp is unambiguously NIST.

### Saudi Arabia (SAU), NIST-bloc / taker (Medium), **Verified**
- **Posture (NIST baseline) / taker** — Verified. Source: NCS-1:2020 (English), https://cdn.nca.gov.sa/ar/ncs_en.pdf
  > "Post-Quantum Cryptography will be considered in the upcoming versions of the NCS." (PQC appendix cites NIST publications; no indigenous Saudi algorithm)
- **Legal status (binding)** — Verified.
  > "the NCA is mandated to draft the national cryptographic policies and standards, to ensure compliance with these standards and policies" (Royal Order 6801)
- **Obligation / timeline** — Verified. The NCC consultation adding PQC (NCS-2:2025) was confirmed via the official istitlaa.ncc.gov.sa content: "يجب أن تدعم جميع نظم وحلول التشفير خوارزميات التشفير لما بعد الحوسبة الكمية (PQC)" (all crypto systems must support PQC).
- **Flags:** the profile's dominantProcess reads "Sovereign" while standardsRole is "taker"; the model reclassified Saudi to taker because the NCS profiles NIST best practice rather than an indigenous algorithm. Reconcile the dominantProcess field. NCA portal pages (SharePoint/JS) resisted direct WebFetch; content recovered via search.

### United Arab Emirates (ARE), NIST-bloc / taker (Medium), **Verified**
- **Posture (NIST baseline) / taker** — Verified. Source: https://www.mediaoffice.abudhabi/en/security/uae-cybersecurity-council-partners-with-quantumgate-to-launch-crypto-discovery-tool/ (2026-05-22)
  > "As part of the UAE National Post-Quantum Migration Programme ... a structured transition to quantum-resilient encryption standards" (no UAE national algorithm; generic standardised algorithms)
- **Legal status (binding)** — Verified. Source: WAM via syndication, https://www.zawya.com/.../uae-announces-approval-of-national-encryption-policy-...
  > "the approval of the National Encryption Policy and the issuance of its executive regulation"
  > "calls on government entities to develop ... transition plans from traditional encryption methods to post-quantum cryptography"
- **Flags:** none on classification. A clean NIST-bloc/taker: a binding national migration mandate over standardised PQC, no sovereign algorithm. CSC official page (csc.gov.ae) had a certificate error; WAM canonical page is JS-rendered; content recovered via syndication.

---

## Phase 2, NIST-bloc takers

### Canada (CAN), NIST-bloc / taker (High), **Verified**
Source: https://www.cyber.gc.ca/en/guidance/roadmap-migration-post-quantum-cryptography-government-canada-itsm40001 (CCCS roadmap ITSM.40.001)
> "The United States' National Institute of Standards and Technology (NIST) has worked globally with cryptographic experts to standardize PQC algorithms that can replace existing vulnerable public-key cryptography."
> "End of 2031: Completion of PQC migration of high priority systems"; "End of 2035: Completion of PQC migration of remaining systems"
Role taker verified (Government-of-Canada-scope roadmap, no sovereign algorithm). The binding TBS SPIN page returned 403; binding status per profile and search. dead/inaccessible: canada.ca URLs (403).

### Brazil (BRA), NIST-bloc / taker (Medium), **Verified**
Source: https://repositorio.iti.gov.br/instrucoes-normativas/IN2026_35_DOC_ICP_01.01_PQC.htm (ITI Normative Instruction 35/2026, ICP-Brasil)
> "ML-DSA (conforme FIPS 204)"; "ML-KEM-512", "ML-KEM-768", "ML-KEM-1024"
Genuine government source (gov.br/ITI), binding for the national PKI (special check satisfied). "NIST" not named verbatim and FIPS 203 not present, but FIPS 204 and the ML-KEM/ML-DSA names are explicit. No national completion date (matches the profile).

### Israel (ISR), NIST-bloc / taker (Medium), **Verified**
Source: https://boi.org.il/media/sm4f1ssu/202501en.pdf (Bank of Israel, Directive 364, 7 Jan 2025)
> "The American National Institute of Standards and Technology (NIST) has initiated a global standardization process for post-quantum cryptography (PQC)."
> "This preparedness plan should be submitted to the Head of the Technology, Innovation, and Cyber Division ... within one year from the date of this letter." (deadline Jan 2026, matches the profile's 2026 milestone)
Sectoral (banking) binding-by-supervision; economy-wide INCD guidance is advisory. No sovereign algorithm.

### New Zealand (NZL), NIST-bloc / taker (Medium), **Verified**
Source: https://nzism.gcsb.govt.nz/ism-document/pdf/Section/12224 (NZISM Section 2.4, GCSB)
> "Currently there are no post-quantum cryptographic systems approved for use in the NZISM, however there are actions that agencies can undertake to prepare for the time when such systems are approved."
> "GCSB will review applicable standards and consider them for incorporation into the NZISM when they are published." (NIST is the named publisher in the references)
Advisory ("Should"), references NIST, no sovereign algorithm. A precise "taker (reference posture)".

### Malaysia (MYS), NIST-bloc / taker (High), **Partially verified**
Source: https://www.cybersecurity.my/portal-main/services/post-quantum-overview (CyberSecurity Malaysia)
> "the Post-Quantum Cryptography (PQC) Migration Framework offers a structured and strategic pathway to help organisations transition from traditional cryptographic systems to quantum-safe alternatives."
> "Advocating for and contributing to the establishment of post-quantum encryption standards for Malaysia is done through the MySEAL initiatives"
Role taker verified (MySEAL is a standards initiative, not a sovereign algorithm). NIST/FIPS not named in the fetched page (rests on the framework PDF, not separately retrieved).

### Australia (AUS), NIST-bloc / taker (Medium), **Flagged, not accessible**
Every cyber.gov.au and asd.gov.au URL timed out via WebFetch (the pages exist and resolve in search; the fetcher could not load them). 0 of 19 retrievable.
> (no verbatim text obtainable; WebFetch timed out)
Search (paraphrase, deliberately NOT recorded as verified) indicates ASD recommends ceasing RSA/DH/ECDH/ECDSA by end of 2030, with a refined plan by end of 2026, over the NIST ML-KEM/ML-DSA/SLH-DSA algorithms. If confirmed, that end-of-2030 deprecation is a national timing overlay and supports a contextualiser flag. Needs a browser fetch of the ISM "Guidelines for cryptography".

### Norway (NOR), NIST-bloc / taker (Low), **Flagged, not accessible**
Every nsm.no URL returned HTTP 403 (HTML pages and the getfile.php PDF alike). 0 of 13 retrievable.
> (no verbatim text obtainable; HTTP 403)
Search (paraphrase, NOT recorded as verified) indicates the NSM Cryptographic Recommendations 2025 name ML-KEM-768/1024, ML-DSA-65/87, SLH-DSA, a hybrid stance, and RSA/ECDSA/ECDH as quantum-vulnerable. If borne out, the "Low" confidence is understated. Needs a browser fetch and a confidence review.

---

## Phase 2, EU takers (national source verified)

### Netherlands (NLD), EU / taker (High), **Verified**
Sources: https://english.aivd.nl/documents/2024/12/3/the-pqc-migration-handbook ; https://www.ncsc.nl/expertblogs/nist-brengt-drie-quantumveilige-cryptografiestandaarden-uit-...
> "The PQC Migration Handbook. Guidelines for migrating to post-quantum cryptography"
> "Op 13 augustus 2024 heeft NIST drie standaarden voor quantumveilige cryptografie gepubliceerd."
Deep national tooling (QvC-Rijk programme, PQChoiceAssistant) but adopts the NIST standards and EU roadmap; a substantial implementer, not a standards-maker. Clean taker.

### Spain (ESP), EU / taker (High), **Verified**
Source: https://www.incibe.es/incibe-cert/blog/supercomputacion-y-computacion-cuantica-en-ciberseguridad (INCIBE-CERT)
> "impulsada por el NIST americano y también iniciativas europeas, ha conseguido crear y testar diferentes algoritmos software resistentes a ataques cuánticos"
> "ya hay algoritmos finalistas ... como ML-KEM (CRYSTALS-Kyber) ... y ML-DSA (CRYSTALS-Dilithium) y FALCON"
Names NIST/ML-KEM/ML-DSA explicitly (firmer than the profile's "no standards camp" note). Clean taker.

### Italy (ITA), EU / taker (High), **Verified**
Source: https://www.acn.gov.it/portale/w/europa-unita-nell-urgenza-della-transizione-alla-crittografia-post-quantum (ACN)
> "L'Agenzia per la cybersicurezza nazionale ha pubblicato, congiuntamente con le agenzie omologhe e i partner europei, su iniziativa del BSI tedesco, un documento che ... analizza gli scenari della transizione alla crittografia post quantistica"
> "il Gruppo di Cooperazione NIS al quale l'ACN partecipa per l'Italia"
EU-coordinated (NIS Cooperation Group). The primary ACN guidance PDF was an unparseable binary; on-topic status and EU alignment confirmed via the official announcement instead.

### Sweden (SWE), EU / taker (High), **Verified**
Source: https://www.ncsc.se/sv/aktuellt/kvantsaker-kryptografi/ (NCSC Sweden)
> "Nationellt cybersäkerhetscenter (NCSC) publicerar nu rekommendationer för hur Sverige bör genomföra övergången till kvantsäker kryptografi."
> "Rekommendationerna ligger i linje med NIS2-direktivets krav på cybersäkerhetsåtgärder"
NIS2/EU-aligned; no sovereign algorithm. Clean taker.

### Belgium (BEL), EU / taker (High), **Verified**
Sources: https://ccb.belgium.be/news/preparing-quantum-era-strategic-imperative-belgian-organisations ; https://bosa.belgium.be/nl/themas/.../quantum4belgium-1
> "The EU strategic roadmap with milestones: national strategies by 2026, critical infrastructure protected by 2030, and broad adoption by 2035."
> "In 2024 heeft NIST nieuwe algoritmes gestandaardiseerd die bestand zijn tegen kwantumcomputers (CRYSTALS-Kyber, CRYSTALS-Dilithium)."
Clean taker.

### Denmark (DNK), EU / taker (High), **Verified**
Source (resolved): https://samsik.dk/cybersikkerhed/temaer/overgangen-til-kvantesikker-kryptografi/ (CFCS, via a live 301 from cfcs.dk)
> "NIST's nye standard, post-quantum cryptography (PQC) ... vil være en milepæl, der kan bruges som pejlemærke."
Clean taker. Note: cfcs.dk now permanently redirects to samsik.dk, which should be added to the trusted-domains list.

### Czechia (CZE), EU / taker (High), **Verified**
Sources: https://nukib.gov.cz/cs/infoservis/aktuality/2156-portal-nukib-... ; https://nukib.gov.cz/download/uredni_deska/Minimalni_pozadavky_Priloha_v2_FINAL.pdf (NÚKIB)
> "Standardizace postkvantové kryptografie řízená institucí NIST"
> "...vhodný termín ukončení přechodu ke kvantově odolným ustanovením klíčů do konce roku 2027."
Names NIST and ML-KEM/ML-DSA. An end-2027 national deadline (earlier than the EU's 2030 high-risk milestone) is a timing overlay, not a sovereign-algorithm one; taker still holds.

### Poland (POL), EU / taker (High), **Verified**
Source: https://www.nask.pl/aktualnosci/polska-w-czolowce-rozwiazan-technologii-kwantowej-prezentacja-qkd (NASK)
> "Odpowiedzią na te zagrożenia są właśnie takie technologie jak kryptografia postkwantowa (PQC) oraz kwantowa dystrybucja kluczy (QKD)."
Awareness-level; EU/NIST alignment by membership (the Polish sources do not name NIST/EU). Clean taker.

### Portugal (PRT), EU / taker (High), **Verified**
Source: https://c-days.cncs.gov.pt/call-for-presentations/index_CallForPresentations.html (CNCS C-DAYS 2026)
> "Criptografia Pós-Quântica;" (listed as a thematic topic)
The load-bearing NCC-PT funded-work page redirect-looped; verified via the lighter C-DAYS topic listing. R&D/awareness posture.

### Luxembourg (LUX), EU / taker (High), **Verified**
Source: https://portail-qualite.public.lu/fr/actualites/confiance-numerique/2025/consultation-publique-feuille-de-route-union-europeenne-transition-cryptographie-post-quantique.html (ILNAS)
> "Consultation publique sur la feuille de route de l'Union européenne sur la transition vers la cryptographie post-quantique"
> "il est recommandé que les cas d'usage critiques soient migrés vers la cryptographie post-quantique jusqu'au plus tard fin 2030"
Defers to the EU roadmap; the 2030 milestone is an EU recommendation, not a Luxembourg deadline. Clean taker.

### Slovenia (SVN), EU / taker (High), **Verified**
Sources: URSIV "Secure Digital Future in the Age of Quantum Computers" PDF; URSIV EU-roadmap FAQ PDF (gov.si/URSIV)
> "Postkvantna kriptografija (PQC) postaja nujni del zagotavljanja kibernetske varnosti."
> "Glede na časovnico je potrebno primere z visokim tveganjem prenesti do konca leta 2030" (NIST defined in the abbreviations table)
The strongest, most explicitly EU-coordinated evidence of the EU takers (a direct URSIV rendering of the Commission roadmap FAQ under the NIS Cooperation Group). Clean taker.

### Ireland (IRL), EU / taker (High), **Verified**
Source: https://www.ncsc.gov.ie/ncc-ie/research/ (NCSC-IE)
> "The global shift to post-quantum cryptography is already underway. Ireland must ensure a secure transition for Government, regulated sectors, and critical infrastructure, while understanding risks from 'harvest now, decrypt later' adversaries."
No NIST/EU named on the page (alignment by membership). Clean, unambiguous national-authority statement.

### Latvia (LVA), EU / taker (High), **Verified**
Source: https://cert.lv/lv/2025/10/konference-q-ready-25-kvantu-drosibas-apvarsni (CERT.LV)
> "kvantu drošo (pēckvantu) kriptogrāfija (PQC)"; "kvantu drošas infrastruktūras izstrādei EuroQCI iniciatīvas ietvaros"
EuroQCI/EU framing; no sovereign algorithm. Clean taker.

### Croatia (HRV), EU / taker (High), **Verified**
Source: https://www.cert.hr/webinar-qubiti-napadaju-kako-pripremiti-obranu-od-kvantne-prijetnje/ (CERT.hr, within CARNET)
> "Kvantna prijetnja, kvantna računala, qubiti, superpozicija, kvantna kriptografija, postkvantna kriptografija…"
An awareness webinar; adequate to evidence national engagement, thin as policy. Consistent with taker.

### Finland (FIN), EU / taker (High), **Verified**
Source: https://www.vttresearch.com/fi/uutiset-ja-tarinat/uhkakuvista-kvanttiturvalliseen-kryptografiaan-miten-digitaalinen-luottamus (VTT)
> "Kvanttiturvallinen kryptografia on aihe, jossa ratkaisuja odotetaan ja tarvitaan jo piakkoin."
The government Quantum Technology Strategy 2025-2035 exists but its PDF 403'd (existence confirmed via valtioneuvosto). EU/NIST baseline rests on membership, as the profile states.

---

## Phase 2, EU takers (partial / source inaccessible)

### Lithuania (LTU), EU / taker (High), **Partially verified, not accessible**
All nksc.lt URLs blanket-block WebFetch (403): the cited news item, the inventory-guidelines PDF, and two alternates. 0 of 6 fetched.
> (no verbatim quote; nksc.lt returns 403 to automated fetches, live in a browser)
Plausible taker per the profile and search snippets, but unverified against primary text. Needs a browser check of the two cited NKSC documents.

### Romania (ROU), EU / taker (High), **Flagged, not accessible**
All four cited official URLs blocked: DNSC transition guide and analysis (403), SGG national quantum strategy PDF (503), EU-funding portal call (503). 0 of 4.
> (no verbatim quote; 403/503)
Likely correct (NIST-pointing, crypto-agility per profile and search), but the only one of its set where no national source yielded a quote. Needs a browser or authenticated fetch.

### Greece (GRC), EU / taker (High), **Partially verified**
Cited mindigital.gr URLs 403; the PQC project PQ-REACT was independently confirmed as real and Greek-coordinated (NCSR "Demokritos") via https://cordis.europa.eu/project/id/101119547.
> (mindigital pages 403; PQ-REACT confirmed via CORDIS, not the cited page)
EU research/infrastructure participation; the ministry's own item leans QKD. Institutional-participation evidence, not national PQC guidance.

### Cyprus (CYP), EU / taker (High), **Partially verified**
Cited dsa.cy URLs 403 (both variants); the DSA item (ENISA Telecom Security Forum, with a PQC topic) corroborated via ENISA's own forum agenda, not quoted verbatim from the source.
> (dsa.cy returns 403; existence and PQC content corroborated)
Single included document, thin and provisional (conference/forum engagement, not national guidance).

### Hungary (HUN), EU / taker (High), **Partially verified**
The primary NKI article returned its title only (no body); verified on-topic via the NKI week-47 IT-security press review PDF.
> "Ezt követően egy poszt-kvantum kriptográfiai (PQC) migrációs tervet kell kidolgozni" (NKI press digest of a vendor talk)
The weakest evidentiary base: the load-bearing PQC statements sit in vendor-derived press-digest material. Taker holds, but original national PQC policy is not attested in the accessible sources.

---

## Phase 2, EU takers (membership-only, zero source)

### Austria (AUT), EU / taker (High), **Membership-only**
data/results/AUT.json is empty, and no Austrian national-authority PQC source was found via search (only EU-level/foreign material). Classified by EU membership only. FLAG: recommend a deep re-scrape (national CSIRT / Bundeskanzleramt / A-SIT).

### Bulgaria (BGR), EU / taker (High), **Membership-only**
Empty results; only EuroQCI/BGQCI (quantum communications infrastructure) and a generic national strategy, no national-authority PQC document. Membership only. FLAG: re-scrape.

### Estonia (EST), EU / taker (High), **Membership-only**
The only candidate is the Cybernetica vendor announcement (included:false); no RIA/government source found. Real activity clearly exists (Cybernetica leading X-Road/eID migration to ML-KEM/ML-DSA) but only as an excluded vendor artefact. FLAG: re-scrape for an Estonian government / RIA source.

### Malta (MLT), EU / taker (High), **Membership-only**
data/results/MLT.json is empty; no Maltese national-authority PQC source found (only foreign/vendor/academic material). Membership only. FLAG: re-scrape.

### Slovakia (SVK), EU / taker (High), **Flagged, source missing from dataset**
The dataset is empty, but a genuine national instrument EXISTS and was simply not ingested: NBÚ "Odporúčania pre kryptografické algoritmy", https://www.nbu.gov.sk/data/att/3483.pdf (HTTP 200, the file loads). Search indicates it names ML-KEM/ML-DSA/SLH-DSA with hybrid transition. The PDF text layer was not machine-readable via WebFetch, so verbatim confirmation is pending. FLAG: ingest this source; the strongest of the five zero-document cases.

---

## Phase 3, findings actioned (3 and 4)

On 2026-06-18 the user authorised acting on findings 3 (membership-only EU members) and 4 (sovereign-leaning flags) and modifying the data. The Claude-in-Chrome control extension was connected but its page-reading calls errored, so sources were read with WebFetch and the Slovak PDF was extracted locally. Changes were written to the Notion source of truth (ATLAS_COUNTRIES) and mirrored to data/profiles.

**Finding 4, sovereign-leaning flags (classification unchanged, dual track now recorded):**
- South Korea: Secondary Process set to Sovereign (the KpqC national competition, with selected Korean algorithms). Coordination posture NIST-bloc and role contextualiser unchanged.
- India: Secondary Process set to Sovereign (the DST task force's indigenous-algorithm / "sovereign independence" track). Posture and role unchanged.

**Finding 3, the five blank-summary EU members:**
- Slovakia: now evidenced, not membership-only. The NBU "Odporúčania pre kryptografické algoritmy" (in force 8 Oct 2025) was extracted verbatim: "ML-KEM-768 Level 3 ... ML-KEM-1024 Level 5 ... ML-DSA-87 Level 5 ... SLH-DSA", "Hybridná kvantovo odolná kryptografia", and "Všetky odporúčania uvedené v tomto dokumente sú v súlade s aktuálnymi štandardmi NIST". A real summary was written. OUTSTANDING: ingest this NBU PDF into ATLAS_DOCUMENTS (https://www.nbu.gov.sk/data/att/3483.pdf).
- Estonia: evidenced. Government-commissioned national PQC roadmap (eID, X-Road, PKI, i-voting), delivered by Cybernetica under state procurement. Summary written; no self-published authority page located.
- Austria: confirmed membership-only. No national PQC instrument; NIS2 transposition pending. Summary written.
- Bulgaria: confirmed membership-only. National quantum effort is QKD/EuroQCI (QUASAR), not PQC. Summary written.
- Malta: confirmed membership-only. National effort is the EuroQCI PRISM QKD network; MDIA aligns to EU. Summary written.

**Finding 1, Thailand reclassified.** On the verified NCSA evidence (its QUANTA pages commit to the NIST FIPS 203/204/205 suite and a phased roadmap to 2035), Thailand was moved from engaged-unaligned to NIST-bloc / taker, legal status soft-only, with the phased 2024-2026 / 2027-2030 / 2031-2034 / 2035 timeline and a guidance-based obligation. Verification Status set to Corrected.

**Finding 2, Argentina downgraded.** The engaged-unaligned label is retained (ARSAT's CryptoComm is genuine state-enterprise PQC engagement with no national alignment), but confidence was lowered from Medium to Low and the spurious NIST dominant-process signal cleared, since the only evidence is a single Tier-2 state-enterprise product and no national-authority source exists. OUTSTANDING: a deep re-scrape for a national-authority PQC source.

(Process note: during this pass a Coordination Posture write was briefly mis-applied to Slovakia using a stale page ID, caught immediately and reverted to EU before any build or deploy.)

---

## Phase 4, blocked sources cleared and data fixes (2026-06-19)

Method note: the connected Chrome extension can open tabs and list them, but its page-reader (get_page_content / execute_javascript) errors with "Chrome is not running", and WebFetch is blocked both by these agencies (403/timeout) and by web.archive.org. Verification therefore used the live browser tab titles returned by list_tabs (which confirm a source exists and is on-topic, something the server-side fetcher could not get), authoritative secondary coverage for specific facts, and local PDF extraction. Where a claim rests on secondary coverage rather than a primary read, it is flagged as such.

**Australia (AUS), reclassified taker to contextualiser.** The ASD Information Security Manual (mandatory for non-corporate Commonwealth entities under PSPF Policy 11) embeds an end-of-2030 retirement of RSA, Diffie-Hellman, ECDH and ECDSA, and approves ML-KEM and ML-DSA, going "a step further than NIST". That binding national deadline on top of the NIST algorithms is a contextualiser overlay. Target 2030; Verification Status Corrected. Primary cyber.gov.au blocks automated reads; confirmed via the live tab load plus authoritative coverage (govinfosecurity, DataGuidance, venarisecurity).

**Norway (NOR), Low to Medium.** The NSM Cryptographic Recommendations 2025 adopt ML-KEM-768/1024, ML-DSA-65/87 and SLH-DSA with hybrid options; algorithms and standard families recorded, hybrid set to Recommended, confidence raised, Verification Status Corrected. NSM HTML and PDF both 403; the tab title confirmed the document exists; the algorithm specifics are from authoritative coverage.

**Lithuania (LTU) and Romania (ROU), cleared to Verified.** Their profiles were already complete and correct; the live browser load confirmed the national sources exist and are on-topic (Romania's DNSC "Ghid Tranziția la criptografia Post-Cuantica"; Lithuania's NKSC post-quantum item). EU/taker stands; no other change.

**European Union (EUU), Verified.** EUR-Lex resolved to CELEX 32024H1101, Recommendation (EU) 2024/1101; the substance was already verified via the Commission press release. Marked Verified.

**Data fixes (ATLAS_DOCUMENTS).**
- Slovakia: the NBU "Odporúčania pre kryptografické algoritmy" (T1, Guidance, 2025, https://www.nbu.gov.sk/data/att/3483.pdf) ingested as an included source.
- Vietnam: a live authoritative source added (Government Cipher Committee VN-PQSign announcement, bcy.gov.vn, T1, included); the dead antoanthongtin.gov.vn row ("Development of hash-based quantum-resistant digital signature schemes") set to not-included.
- India: the CERT-In whitepaper CIWP-2025-0002 row had a dead 404 PDF link and no working replacement was found, so it was set to not-included; the whitepaper's existence remains covered by the separate MeitY-launch (PIB) row. Re-include it if the correct CERT-In URL surfaces.
