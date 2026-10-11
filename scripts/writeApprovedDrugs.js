const fs = require("fs");
const path = require("path");

// Curated approved small-molecule drugs (public PubChem / FDA labeling).
// Columns: name, cid, smiles, indication, class, mw, xlogp, hbd, hba, rot, tpsa
const TSV = `
Imatinib	5291	CC1=C(C=C(C=C1)NC(=O)C2=CC=C(C=C2)CN3CCN(CC3)C)NC4=NC=CC(=N4)C5=CN=CC=C5	Chronic myeloid leukemia	kinase inhibitor	493.6	3.5	2	7	7	86.3
Dasatinib	3062316	CC1=C(C(=CC=C1)Cl)NC(=O)C2=CN=C(S2)NC3=NC(=NC(=C3)N4CCN(CC4)CCO)C	Chronic myeloid leukemia	kinase inhibitor	488.0	3.0	3	9	8	134.8
Erlotinib	176870	COCCOc1cc2c(cc1OCCOC)ncnc2Nc3cccc(c3)C#C	Non-small cell lung cancer (EGFR)	kinase inhibitor	393.4	2.7	1	7	10	74.7
Gefitinib	123631	COC1=C(C=C2C(=C1)N=CN=C2NC3=CC(=C(C=C3)F)Cl)OCCCN4CCOCC4	Non-small cell lung cancer (EGFR)	kinase inhibitor	446.9	3.2	1	7	8	68.7
Nilotinib	644241	CC1=C(C=C(C=C1)C(=O)NC2=CC(=CC(=C2)N3C=C(N=C3)C)C(F)(F)F)NC4=NC=CC(=N4)C5=CN=CC=C5	Chronic myeloid leukemia	kinase inhibitor	529.5	4.9	2	8	6	97.6
Bosutinib	5328940	COC1=C(C(=C(C=C1Cl)Cl)OC)NC2=NC=C3C(=N2)N(C=C3)CCN4CCCC4	Chronic myeloid leukemia	kinase inhibitor	530.5	4.9	1	8	8	82.9
Ponatinib	24826799	CC1=C(C=C(C=C1)C(=O)NC2=CC(=C(C=C2)CN3CCN(CC3)C)C(F)(F)F)C#CC4=CN=C5N4N=CC=C5	Chronic myeloid leukemia	kinase inhibitor	532.6	4.1	1	8	6	65.8
Lapatinib	208908	CS(=O)(=O)CCNCC1=CC=C(O1)C2=CC3=C(C=C2)N=CN=C3NC4=CC(=C(C=C4)OCC5=CC(=CC=C5)F)Cl	HER2-positive breast cancer	kinase inhibitor	581.1	5.4	2	9	11	114.7
Afatinib	10184653	CN(C)C/C=C/C(=O)NC1=C(C=C2C(=C1)C(=NC=N2)NC3=CC(=C(C=C3)F)Cl)O[C@H]4CCOC4	Non-small cell lung cancer (EGFR)	kinase inhibitor	485.9	3.6	2	8	8	88.6
Osimertinib	71496458	COC1=C(C=C2C(=C1)N=CN=C2NC3=CC(=C(C=C3)NC(=O)C=C)N(C)CCN(C)C)OC	Non-small cell lung cancer (EGFR T790M)	kinase inhibitor	499.6	3.4	2	8	10	87.6
Sunitinib	5329102	CCN(CC)CCNC(=O)C1=C(NC(=C1C)C=C2C3=C(C=CC(=C3)F)NC2=O)C	Renal cell carcinoma	kinase inhibitor	398.5	3.2	3	4	8	77.2
Sorafenib	216239	CNC(=O)C1=NC=CC(=C1)OC2=CC=C(C=C2)NC(=O)NC3=CC(=C(C=C3)Cl)C(F)(F)F	Renal cell and hepatocellular carcinoma	kinase inhibitor	464.8	3.8	3	7	6	92.4
Pazopanib	10113978	CC1=C(C=C(C=C1)NC2=NN=C(C=C2)N(C)C)NC(=O)C3=CC=C(C=C3)N4CCOCC4	Renal cell carcinoma	kinase inhibitor	437.5	3.1	2	8	5	106.5
Axitinib	6450551	CNC(=O)C1=CC=CC=C1SC2=CC3=C(C=C2)C(=NN3)/C=C/C4=CC=CC=N4	Renal cell carcinoma	kinase inhibitor	386.5	3.5	2	5	5	83.1
Cabozantinib	25102847	COC1=CC2=C(C=CN=C2C=C1OC)OC3=CC=C(C=C3)NC(=O)C4(CC4)C(=O)NC5=CC=C(C=C5)F	Medullary thyroid cancer	kinase inhibitor	501.5	4.5	2	7	8	98.8
Crizotinib	11626560	C[C@@H](OC1=CC(=CN=C1N)N)C2=C(C=CC(=C2Cl)F)Cl	ALK-positive non-small cell lung cancer	kinase inhibitor	450.3	3.7	3	6	5	78.0
Alectinib	49806720	CCC1=CC2=C(C=C1N3CCC(CC3)N4CCOCC4)C(C)(C)C5=C(C2=O)C6=C(N5)C=CC(=C6)C#N	ALK-positive non-small cell lung cancer	kinase inhibitor	482.6	5.2	1	6	4	82.2
Ceritinib	57379345	CC(C)OC1=C(C=C(C=C1)NC2=NC=C(C(=N2)C3=CN=C(C=C3)N4CCN(CC4)C)Cl)C(C)(C)C#N	ALK-positive non-small cell lung cancer	kinase inhibitor	558.1	6.0	2	8	8	105.2
Ibrutinib	24821094	C=CC(=O)N1CCC[C@@H](C1)N2C3=C(C(=N2)C4=CC=C(C=C4)OC5=CC=CC=C5)C(=NC=N3)N	Mantle cell lymphoma (BTK)	kinase inhibitor	440.5	3.6	2	6	6	99.2
Acalabrutinib	71226662	CC#CC(=O)N1CCC[C@H]1C2=NC(=C3N2C=CN=C3N)C4=CC=C(C=C4)C(=O)N5CCCC5	Chronic lymphocytic leukemia (BTK)	kinase inhibitor	465.5	3.0	2	7	5	118.5
Ruxolitinib	25126798	C1CCC(C1)[C@@H](C#N)N2C=C(C=N2)C3=C4C=CNC4=NC=N3	Myelofibrosis (JAK)	kinase inhibitor	306.4	2.1	1	4	3	83.2
Tofacitinib	9926791	C[C@@H]1CCN(C[C@@H]1N(C)C2=NC=NC3=C2C=CN3)C(=O)CC#N	Rheumatoid arthritis (JAK)	kinase inhibitor	312.4	1.5	1	6	3	88.9
Baricitinib	44205240	CCS(=O)(=O)N1CC(C1)(CC#N)N2C=C(C=N2)C3=C4C=CNC4=NC=N3	Rheumatoid arthritis (JAK)	kinase inhibitor	371.4	0.9	1	7	5	127.3
Vemurafenib	42611257	CCCS(=O)(=O)NC1=C(C(=C(C=C1)F)C(=O)C2=CNC3=NC=C(C=C23)C4=CC=C(C=C4)Cl)F	BRAF V600E melanoma	kinase inhibitor	489.9	4.6	2	5	6	100.0
Dabrafenib	44462760	CC(C)(C)C1=NC(=C(S1)C2=NC(=NC=C2)N)C3=C(C(=CC=C3)NS(=O)(=O)C4=C(C=CC=C4F)F)F	BRAF V600E melanoma	kinase inhibitor	519.6	4.8	2	7	5	146.4
Trametinib	11707110	CC1=C2C(=C(N(C1=O)C)NC3=C(C=C(C=C3)I)F)C(=O)N(C(=O)N2C4=CC=CC(=C4)NC(=O)C)C	BRAF-mutant melanoma (MEK)	kinase inhibitor	615.4	3.5	2	6	5	102.2
Palbociclib	5330286	CC1=C(C(=O)N(C2=NC(=NC=C12)NC3=NC=C(C=C3)N4CCNCC4)C5CCCC5)C(=O)C	HR-positive HER2-negative breast cancer (CDK4/6)	kinase inhibitor	447.5	2.3	2	8	5	105.0
Ribociclib	44631912	CN(C)C1=CC=C(C=C1)C2=NC3=C(C=C(C=N3)C4=C(N=C(N=C4)N5CCN(CC5)C)N)N2	HR-positive HER2-negative breast cancer (CDK4/6)	kinase inhibitor	434.5	2.4	2	8	4	91.2
Abemaciclib	46220502	CCN1C2=C(C(=NC=C2)C3=CC4=C(C=C3)N=C(N4)NC5=CC=C(C=C5)N6CCN(CC6)C)C(=C1)C#N	HR-positive HER2-negative breast cancer (CDK4/6)	kinase inhibitor	506.6	3.8	1	8	6	75.0
Midostaurin	9829523	C[C@@]12[C@@H]([C@@H](C[C@@H](O1)N3C4=CC=CC=C4C5=C6C(=C7C8=CC=CC=C8N7[C@]5(C3=O)C)C9=CC=CC=C9N6C2=O)NC(=O)C)OC	FLT3-mutant AML	kinase inhibitor	570.6	5.9	1	6	3	77.8
Gilteritinib	49803313	CCOC1=C(C=C(C=C1)NC2=NC=C(C(=N2)NC3=CC=C(C=C3)N4CCC(CC4)N5CCN(CC5)C)C#N)OC	FLT3-mutant AML	kinase inhibitor	552.7	3.9	2	9	9	121.4
Vandetanib	3081361	CN1CCC(CC1)COC2=C(C=C3C(=C2)N=CN=C3NC4=C(C=C(C=C4)Br)F)OC	Medullary thyroid cancer	kinase inhibitor	475.4	4.5	1	6	6	59.5
Lorlatinib	71731823	C[C@H]1C2=C(C=CC(=C2F)C(=O)N[C@H](C3=NC=C(C=C3)C4=NN(C(=O)N1C4=C)C)C)N	ALK-positive non-small cell lung cancer	kinase inhibitor	406.4	2.5	2	7	1	110.0
Imatinib mesylate	123596	CC1=C(C=C(C=C1)NC(=O)C2=CC=C(C=C2)CN3CCN(CC3)C)NC4=NC=CC(=N4)C5=CN=CC=C5	Chronic myeloid leukemia	kinase inhibitor	589.7	3.5	2	7	7	86.3
Propranolol	4946	CC(C)NCC(COC1=CC=CC2=CC=CC=C21)O	Hypertension and angina (beta-blocker)	beta-blocker	259.3	3.0	2	3	6	41.5
Atenolol	2249	CC(C)NCC(COC1=CC=C(C=C1)CC(=O)N)O	Hypertension (beta-blocker)	beta-blocker	266.3	0.2	3	4	8	84.6
Metoprolol	4171	CC(C)NCC(COC1=CC=C(C=C1)CCOC)O	Hypertension (beta-blocker)	beta-blocker	267.4	1.9	2	4	9	50.7
Carvedilol	2585	COC1=CC=CC=C1OCCNCC(COC2=CC=CC3=C2C4=CC=CC=C4N3)O	Heart failure and hypertension	beta-blocker	406.5	4.2	3	5	10	75.7
Bisoprolol	2405	CC(C)NCC(COC1=CC=C(C=C1)COCCOC(C)C)O	Hypertension (beta-blocker)	beta-blocker	325.4	2.2	2	5	12	59.9
Nebivolol	71301	C1CC2=C(C=CC(=C2)F)OC1C(CNC(C3CCC4=C(O3)C=CC(=C4)F)O)O	Hypertension (beta-blocker)	beta-blocker	405.4	3.3	3	5	6	70.6
Labetalol	3869	CC(CCC1=CC=CC=C1)NCC(C2=CC(=C(C=C2)O)C(=O)N)O	Hypertension (beta-blocker)	beta-blocker	328.4	1.4	4	4	8	95.6
Nadolol	3915	CC(C)(C)NCC(C1CC2=C(C=CC=C2O1)O)O	Hypertension (beta-blocker)	beta-blocker	309.4	0.8	4	5	4	82.0
Sotalol	5253	CC(C)NCC(C1=CC=C(C=C1)NS(=O)(=O)C)O	Ventricular arrhythmias	beta-blocker	272.4	0.2	3	5	5	86.5
Paracetamol	1983	CC(=O)NC1=CC=C(C=C1)O	Pain and fever	analgesic	151.2	0.5	2	2	1	49.3
Ibuprofen	3672	CC(C)CC1=CC=C(C=C1)C(C)C(=O)O	Pain and inflammation	NSAID	206.3	3.5	1	2	4	37.3
Aspirin	2244	CC(=O)OC1=CC=CC=C1C(=O)O	Pain, fever, and antiplatelet use	NSAID	180.2	1.2	1	4	3	63.6
Naproxen	156391	CC(C1=CC2=C(C=C1)C=C(C=C2)OC)C(=O)O	Pain and inflammation	NSAID	230.3	3.3	1	3	3	46.5
Diclofenac	3033	C1=CC=C(C(=C1)CC(=O)O)NC2=C(C=CC=C2Cl)Cl	Pain and inflammation	NSAID	296.1	4.5	2	3	4	49.3
Celecoxib	2662	CC1=CC=C(C=C1)C2=CC(=NN2C3=CC=C(C=C3)S(=O)(=O)N)C(F)(F)F	Osteoarthritis and rheumatoid arthritis	NSAID	381.4	3.4	1	4	3	86.4
Indomethacin	3715	CC1=C(C2=C(N1C(=O)C3=CC=C(C=C3)Cl)C=CC(=C2)OC)CC(=O)O	Pain and inflammation	NSAID	357.8	4.3	1	4	4	68.5
Meloxicam	54677470	CC1=CN=C(S1)NC(=O)C2=C(C3=CC=CC=C3S(=O)(=O)N2C)O	Osteoarthritis	NSAID	351.4	3.4	2	6	2	136.2
Morphine	5288826	CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O	Severe pain	opioid analgesic	285.3	0.9	2	4	0	52.9
Codeine	5284371	COC1=C2C3=C(C[C@@H]4[C@H]5[C@]3(CCN4C)[C@@H](O2)[C@H](C=C5)O)C=C1	Pain and cough	opioid analgesic	299.4	1.2	1	4	1	41.9
Oxycodone	5284603	CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)OC)O[C@H]3C(=O)CC4	Moderate to severe pain	opioid analgesic	315.4	0.3	1	5	1	59.0
Tramadol	33741	CN(C)C[C@H]1CCCC[C@@]1(C2=CC(=CC=C2)OC)O	Moderate pain	opioid analgesic	263.4	2.5	1	3	4	32.7
Naloxone	5284596	CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3C(=O)C=C4	Opioid overdose	opioid antagonist	327.4	1.5	2	5	1	70.0
Loratadine	3957	CCOC(=O)N1CCC(=C2C3=C(CCC4=C2N=CC=C4)C=C(C=C3)Cl)CC1	Allergic rhinitis	antihistamine	382.9	5.2	0	4	3	42.4
Cetirizine	2678	C1CN(CCN1CCOCC(=O)O)C(C2=CC=CC=C2)C3=CC=C(C=C3)Cl	Allergic rhinitis	antihistamine	388.9	2.8	1	5	8	53.0
Diphenhydramine	3100	CN(C)CCOC(C1=CC=CC=C1)C2=CC=CC=C2	Allergies and insomnia	antihistamine	255.4	3.3	0	2	6	12.5
Fexofenadine	3348	CC(C)(C1=CC=C(C=C1)C(CCCN2CCC(CC2)C(C3=CC=CC=C3)C4=CC=CC=C4)O)C(=O)O	Allergic rhinitis	antihistamine	501.7	5.0	2	4	10	81.0
Desloratadine	445708	C1CC2=C(C=CC(=C2)Cl)C(=C3CCNCC3)C4=C1N=CC=C4	Allergic rhinitis	antihistamine	310.8	3.2	1	2	1	24.9
Chlorpheniramine	2725	CN(C)CCC(C1=CC=C(C=C1)Cl)C2=CC=CC=N2	Allergic rhinitis	antihistamine	274.8	3.4	0	2	5	16.1
Hydroxyzine	3658	C1CN(CCN1CCOCCO)C(C2=CC=CC=C2)C3=CC=C(C=C3)Cl	Anxiety and pruritus	antihistamine	374.9	3.4	1	4	8	35.9
Promethazine	4927	CC(CN1C2=CC=CC=C2SC3=CC=CC=C31)N(C)C	Allergies and nausea	antihistamine	284.4	4.8	0	2	3	6.5
Levocetirizine	1549000	C1CN(CCN1CCOCC(=O)O)[C@H](C2=CC=CC=C2)C3=CC=C(C=C3)Cl	Allergic rhinitis	antihistamine	388.9	2.8	1	5	8	53.0
Atorvastatin	60823	CC(C)C1=C(C(=C(N1CC[C@H](C[C@H](CC(=O)O)O)O)C2=CC=C(C=C2)F)C3=CC=CC=C3)C(=O)NC4=CC=CC=C4	Hypercholesterolemia	statin	558.6	5.4	4	6	12	111.8
Simvastatin	54454	CCC(C)(C)C(=O)O[C@H]1C[C@H](C=C2[C@H]1[C@H]([C@H](C=C2)C)CC[C@@H]3C[C@H](CC(=O)O3)O)C	Hypercholesterolemia	statin	418.6	4.7	1	5	7	72.8
Rosuvastatin	446157	CC(C)C1=C(C(=NC(=N1)N(C)S(=O)(=O)C)C2=CC=C(C=C2)F)/C=C/[C@H](C[C@H](CC(=O)O)O)O	Hypercholesterolemia	statin	481.5	1.9	3	8	8	140.9
Pravastatin	54687	CC[C@H](C)C(=O)O[C@H]1C[C@@H](C=C2[C@H]1[C@H]([C@H](C=C2)C)CC[C@@H]3C[C@H](CC(=O)O3)O)O	Hypercholesterolemia	statin	424.5	1.6	3	7	9	124.3
Lovastatin	53232	CC[C@H](C)C(=O)O[C@H]1C[C@H](C=C2[C@H]1[C@H]([C@H](C=C2)C)CC[C@@H]3C[C@H](CC(=O)O3)O)C	Hypercholesterolemia	statin	404.5	4.3	1	5	7	72.8
Fluvastatin	446155	CC(C)N1C2=CC=CC=C2C(=C1/C=C/[C@H](C[C@H](CC(=O)O)O)O)C3=CC=C(C=C3)F	Hypercholesterolemia	statin	411.5	3.5	3	5	8	82.7
Pitavastatin	5282451	C1CC1C2=NC3=C(C=CC=C3C(=C2/C=C/[C@H](C[C@H](CC(=O)O)O)O)C4=CC=C(C=C4)F)	Hypercholesterolemia	statin	421.5	3.5	3	5	7	90.6
Lisinopril	5362119	CCCCN[C@@H](CCC1=CC=CC=C1)C(=O)N2CCC[C@H]2C(=O)O	Hypertension	ACE inhibitor	405.5	-1.0	3	6	11	132.9
Enalapril	5388962	CCOC(=O)[C@H](CCC1=CC=CC=C1)N[C@@H](C)C(=O)N2CCC[C@H]2C(=O)O	Hypertension	ACE inhibitor	376.4	0.6	2	6	10	95.9
Ramipril	5362129	CCOC(=O)[C@H](CCC1=CC=CC=C1)N[C@@H](C)C(=O)N2[C@H]3CCC[C@H]3C[C@H]2C(=O)O	Hypertension	ACE inhibitor	416.5	1.4	2	6	10	95.9
Captopril	44093	C[C@H](CS)C(=O)N1CCC[C@H]1C(=O)O	Hypertension	ACE inhibitor	217.3	0.3	2	4	4	96.4
Losartan	3961	CCCCC1=NC(=C(N1CC2=CC=C(C=C2)C3=CC=CC=C3C4=NNN=N4)Cl)CO	Hypertension	ARB	422.9	4.5	2	7	8	92.5
Valsartan	60846	CCCCC(=O)N(CC1=CC=C(C=C1)C2=CC=CC=C2C3=NNN=N3)[C@@H](C(C)C)C(=O)O	Hypertension	ARB	435.5	3.8	2	7	11	112.1
Olmesartan	158781	CCCC1=NC(=C(N1CC2=CC=C(C=C2)C3=CC=CC=C3C4=NNN=N4)C(=O)O)C(C)(C)O	Hypertension	ARB	446.5	3.0	3	8	8	143.3
Irbesartan	3749	CCCCC1=NC2(CCCC2)C(=O)N1CC3=CC=C(C=C3)C4=CC=CC=C4C5=NNN=N5	Hypertension	ARB	428.5	5.5	1	7	7	87.1
Candesartan	2541	CCOC1=NC2=CC=CC(=C2N1CC3=CC=C(C=C3)C4=CC=CC=C4C5=NNN=N5)C(=O)O	Hypertension	ARB	440.5	4.6	2	8	7	118.8
Telmisartan	65999	CCCC1=NC2=C(N1CC3=CC=C(C=C3)C4=CC=CC=C4C(=O)O)C=C(C=C2C)C5=NC6=CC=CC=C6N5C	Hypertension	ARB	514.6	7.7	1	6	7	72.9
Amlodipine	2162	CCOC(=O)C1=C(NC(=C(C1C2=CC=CC=C2Cl)C(=O)OC)C)COCCN	Hypertension	calcium channel blocker	408.9	3.0	3	6	10	99.9
Nifedipine	4485	CC1=C(C(C(=C(N1)C)C(=O)OC)C2=CC=CC=C2[N+](=O)[O-])C(=O)OC	Hypertension	calcium channel blocker	346.3	2.2	1	8	5	107.8
Diltiazem	39186	CCN(CC)CCNC(=O)C1=C(SC2=CC=CC=C2N(C1=O)CC)C3=CC=CC=C3OC	Hypertension and angina	calcium channel blocker	414.5	3.6	0	6	8	59.1
Verapamil	2520	CC(C)C(CCCN(C)CCC1=CC(=C(C=C1)OC)OC)(C#N)C2=CC(=C(C=C2)OC)OC	Hypertension and arrhythmias	calcium channel blocker	454.6	3.8	0	6	13	63.9
Omeprazole	4594	CC1=CN=C(C(=C1OC)C)CS(=O)C2=NC3=C(N2)C=C(C=C3)OC	GERD and peptic ulcer	PPI	345.4	2.2	1	6	5	96.3
Esomeprazole	9579578	C[C@H]1C2=C(N1)C=CC(=C2)OC.CC3=CN=C(C(=C3OC)C)C[S@](=O)C4=NC5=C(N4)C=CC(=C5)OC	GERD	PPI	345.4	2.2	1	6	5	96.3
Pantoprazole	4679	COC1=C(C=C(C=C1)OCC(F)F)C2=NC3=C(N2)C=CC=C3S(=O)C	GERD and peptic ulcer	PPI	383.4	2.1	1	7	6	105.5
Lansoprazole	3883	CC1=C(C=CN=C1CS(=O)C2=NC3=CC=CC=C3N2)OCC(F)(F)F	GERD and peptic ulcer	PPI	369.4	2.8	1	5	6	87.1
Metformin	4091	CN(C)C(=N)NC(=N)N	Type 2 diabetes	antidiabetic	129.2	-1.3	4	5	1	88.9
Glipizide	3478	CC1=NC=C(N=C1)C(=O)NCCC2=CC=C(C=C2)S(=O)(=O)NC(=O)NC3CCCCC3	Type 2 diabetes	antidiabetic	445.5	1.9	3	8	8	138.0
Glyburide	3488	COC1=C(C=C(C=C1)Cl)C(=O)NCCC2=CC=C(C=C2)S(=O)(=O)NC(=O)NC3CCCCC3	Type 2 diabetes	antidiabetic	494.0	4.2	3	7	9	122.0
Sitagliptin	4369359	C1CN2C(=NN=C2C(F)(F)F)CN1C(=O)C[C@@H](CC3=CC(=C(C=C3F)F)F)N	Type 2 diabetes	antidiabetic	407.3	1.3	1	6	4	77.0
Empagliflozin	11949646	C1CO[C@H](C1)C2=CC=C(C=C2)CC3=C(C=C(C=C3)[C@H]4[C@@H]([C@H]([C@@H]([C@H](O4)CO)O)O)O)Cl	Type 2 diabetes	antidiabetic	450.9	2.3	4	6	5	110.0
Dapagliflozin	9887712	CCOC1=CC=C(C=C1)CC2=C(C=C(C=C2)[C@H]3[C@@H]([C@H]([C@@H]([C@H](O3)CO)O)O)O)Cl	Type 2 diabetes	antidiabetic	408.9	2.2	4	6	6	110.0
Pioglitazone	4829	CCC1=CN=C(C=C1)CCOC2=CC=C(C=C2)CC3C(=O)NC(=O)S3	Type 2 diabetes	antidiabetic	356.4	3.2	1	5	7	93.6
Amoxicillin	33613	CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)[C@@H](C3=CC=C(C=C3)O)N)C(=O)O)C	Bacterial infections	antibiotic	365.4	0.9	4	7	4	132.9
Azithromycin	447043	CC[C@H]1OC(=O)[C@H](C)[C@@H](O[C@H]2C[C@@](C)(OC)[C@@H](O)[C@H](C)O2)[C@H](C)[C@@H](O[C@@H]3O[C@H](C)C[C@@H]([C@H]3O)N(C)C)[C@](C)(O)C[C@@H](C)CN(C)[C@H](C)[C@@H](O)[C@]1(C)O	Bacterial infections	antibiotic	749.0	4.0	5	14	7	180.2
Ciprofloxacin	2764	C1CC1N2C=C(C(=O)C3=CC(=C(C=C32)N4CCNCC4)F)C(=O)O	Bacterial infections	antibiotic	331.3	-1.1	2	6	3	72.9
Doxycycline	54671203	C[C@@H]1C2=C(C(=O)C3=C(C2=O)C(=O)C4=C(C3=O)C(=CC=C4O)O)[C@@](C1N(C)C)(C)O	Bacterial infections	antibiotic	444.4	-0.0	6	9	2	181.6
Metronidazole	4173	CC1=NC=C(N1CCO)[N+](=O)[O-]	Anaerobic and protozoal infections	antibiotic	171.2	-0.0	1	5	3	83.9
Levofloxacin	149096	C[C@H]1COC2=C3N1C=C(C(=O)C3=CC(=C2N4CCN(CC4)C)F)C(=O)O	Bacterial infections	antibiotic	361.4	-0.4	1	7	3	75.0
Trimethoprim	5578	COC1=CC(=CC(=C1OC)OC)CC2=CN=C(N=C2N)N	Bacterial infections	antibiotic	290.3	0.9	2	7	5	105.5
Sulfamethoxazole	5329	CC1=CC(=NO1)NS(=O)(=O)C2=CC=C(C=C2)N	Bacterial infections	antibiotic	253.3	0.9	2	5	3	106.6
Clindamycin	446598	CCC[C@@H]1C[C@H](N(C1)C)C(=O)N[C@@H]([C@H]2O[C@H](SC)[C@H](O)[C@@H](O)[C@H]2O)[C@H](C)Cl	Bacterial infections	antibiotic	425.0	2.2	4	7	7	127.7
Nitrofurantoin	6604200	C1C(=O)N(C(=O)N1/N=C/C2=CC=C(O2)[N+](=O)[O-])N	Urinary tract infections	antibiotic	238.2	-0.5	1	8	3	118.3
Acyclovir	2022	C1=NC2=C(N1COCCO)NC(=NC2=O)N	Herpes simplex and varicella-zoster	antiviral	225.2	-1.6	3	6	4	114.8
Oseltamivir	65028	CCOC(=O)C1=C[C@@H](C[C@@H]([C@H]1NC(=O)C)N)OC(CC)CC	Influenza	antiviral	312.4	1.0	2	5	9	90.3
Sofosbuvir	45375808	C[C@@H](C(=O)OC(C)C)N[P@](=O)(OC[C@@H]1[C@H]([C@@]([C@@H](O1)N2C=CC(=O)NC2=O)(C)F)O)OC3=CC=CC=C3	Chronic hepatitis C	antiviral	529.5	1.0	3	11	10	167.7
Tenofovir	464205	CC(C)OC(=O)OCP(=O)(CO[C@H](C)CN1C=NC2=C1N=CN=C2N)O	HIV and hepatitis B	antiviral	287.2	-1.6	3	8	6	141.1
Lamivudine	60825	C[C@H]1O[C@H](CS1)N2C=CC(=NC2=O)N	HIV and hepatitis B	antiviral	229.3	-0.9	2	5	1	90.4
Fluoxetine	3386	CNCCC(C1=CC=CC=C1)OC2=CC=C(C=C2)C(F)(F)F	Major depressive disorder	SSRI	309.3	4.1	1	2	7	21.3
Sertraline	68617	CN[C@H]1CC[C@H](C2=CC=CC=C12)C3=CC(=C(C=C3)Cl)Cl	Major depressive disorder	SSRI	306.2	5.1	1	1	2	12.0
Citalopram	2771	CN(C)CCCC1(C2=C(CO1)C=C(C=C2)C#N)C3=CC=C(C=C3)F	Major depressive disorder	SSRI	324.4	3.8	0	3	6	36.3
Escitalopram	146570	CN(C)CCC[C@@]1(C2=C(CO1)C=C(C=C2)C#N)C3=CC=C(C=C3)F	Major depressive disorder	SSRI	324.4	3.8	0	3	6	36.3
Venlafaxine	5656	CN(C)CC(C1=CC=C(C=C1)OC)C2(CCCCC2)O	Major depressive disorder	SNRI	277.4	2.9	1	3	5	32.7
Duloxetine	60835	CNCC[C@H](C1=CC=CS1)OC2=CC=CC3=CC=CC=C32	Major depressive disorder	SNRI	297.4	4.2	1	3	6	40.6
Amitriptyline	2160	CN(C)CCC=C1C2=CC=CC=C2CCC3=CC=CC=C31	Depression and neuropathic pain	tricyclic antidepressant	277.4	5.0	0	1	3	3.2
Bupropion	444	CC(NC(C)(C)C)C(=O)C1=CC(=CC=C1)Cl	Depression and smoking cessation	antidepressant	239.7	3.3	1	2	4	29.1
Mirtazapine	4205	CN1CCN2C(C1)C3=CC=CC=C3CC4=C2N=CC=C4	Major depressive disorder	antidepressant	265.4	2.9	0	3	0	19.4
Paroxetine	43815	C1CNC[C@H]([C@@H]1C2=CC=C(C=C2)F)COC3=CC4=C(C=C3)OCO4	Major depressive disorder	SSRI	329.4	3.5	1	4	4	39.7
Risperidone	5073	CC1=C(C(=O)N2CCCCC2=N1)CCN3CCC(CC3)C4=NOC5=C4C=CC(=C5)F	Schizophrenia	antipsychotic	410.5	2.5	0	6	4	61.9
Olanzapine	4585	CC1=NC=C2C(=N1)C3=CC=CC=C3N(C2)CCN4CCN(CC4)C	Schizophrenia	antipsychotic	312.4	3.4	1	4	3	30.9
Quetiapine	5002	C1CN(CCN1CCOCCO)C2=NC3=CC=CC=C3SC4=CC=CC=C42	Schizophrenia and bipolar disorder	antipsychotic	383.5	2.8	1	5	8	48.3
Aripiprazole	60795	C1CCN(CC1)CCCCN2C(=O)C3=C(N2)C=CC(=C3)Cl.C4=CC=C(C=C4)OCCCCN5CCN(CC5)C6=C(C(=CC=C6)Cl)Cl	Schizophrenia	antipsychotic	448.4	4.6	1	4	8	44.8
Haloperidol	3559	C1CN(CCC1(C2=CC=C(C=C2)Cl)O)CCCC(=O)C3=CC=C(C=C3)F	Schizophrenia	antipsychotic	375.9	3.2	1	3	6	40.5
Clozapine	2818	CN1CCN(CC1)C2=NC3=C(C=CC=C3Cl)NC4=CC=CC=C42	Treatment-resistant schizophrenia	antipsychotic	326.8	3.2	1	4	1	30.9
Lamotrigine	3878	C1=CC(=C(C(=C1)Cl)Cl)C2=C(N=C(N=N2)N)N	Epilepsy	anticonvulsant	256.1	1.9	2	5	1	90.7
Valproic acid	3121	CCCC(CCC)C(=O)O	Epilepsy and bipolar disorder	anticonvulsant	144.2	2.8	1	2	5	37.3
Levetiracetam	5284583	CC[C@H](C(=O)N)N1CCCC1=O	Epilepsy	anticonvulsant	170.2	-0.6	1	3	3	63.4
Carbamazepine	2554	C1=CC=C2C(=C1)C=CC3=CC=CC=C3N2C(=O)N	Epilepsy	anticonvulsant	236.3	2.5	2	3	0	46.3
Phenytoin	1775	C1=CC=C(C=C1)C2(C(=O)NC(=O)N2)C3=CC=CC=C3	Epilepsy	anticonvulsant	252.3	2.5	2	4	2	58.2
Gabapentin	3446	C1CCC(CC1)(CC(=O)O)CN	Neuropathic pain and epilepsy	anticonvulsant	171.2	-1.1	2	3	3	63.3
Pregabalin	5486971	CC(C)C[C@H](CC(=O)O)CN	Neuropathic pain and epilepsy	anticonvulsant	159.2	-1.6	2	3	4	63.3
Topiramate	5284627	CC1(C)OC2COC3(COS(=O)(=O)N)OC(C)(C)OC3C2O1	Epilepsy and migraine	anticonvulsant	339.4	0.0	2	8	3	125.1
Warfarin	54678486	CC(=O)CC(C1=CC=CC=C1)C2=C(C3=CC=CC=C3OC2=O)O	Thromboembolism prevention	anticoagulant	308.3	2.7	1	4	4	67.5
Apixaban	10182969	COC1=CC=C(C=C1)N2C3=C(CCN(C3=O)C4=CC=C(C=C4)N5CCCCC5=O)C(=N2)C(=O)N	Atrial fibrillation and VTE	anticoagulant	459.5	2.2	1	8	5	110.0
Rivaroxaban	9875401	C1COC(=O)N1C2=CC=C(C=C2)N3C[C@@H](OC3=O)CNC(=O)C4=NOC(=C4)Cl	Atrial fibrillation and VTE	anticoagulant	435.9	2.5	1	7	6	110.5
Dabigatran	216701	CN1C2=C(C=C(C=C2)C(=O)N(CCC(=O)O)C3=CC=CC=N3)N=C1CNC4=CC=C(C=C4)C(=N)N	Atrial fibrillation	anticoagulant	471.5	-0.6	4	9	10	150.2
Clopidogrel	60606	COC(=O)[C@H](C1=CC=CC=C1Cl)N2CCC3=C(C2)C=CS3	Acute coronary syndrome	antiplatelet	321.8	3.8	0	4	4	54.5
Prednisone	5865	CC12CCC(=O)C=C1CCC3C2C(=O)CC4(C3CCC4(C(=O)CO)O)C	Inflammatory and autoimmune disease	corticosteroid	358.4	1.5	2	5	2	91.7
Dexamethasone	5743	C[C@@H]1C[C@H]2[C@@H]3CCC4=CC(=O)C=C[C@@]4(C)[C@@]3(F)[C@@H](O)C[C@@]2(C)[C@]1(O)C(=O)CO	Inflammatory and autoimmune disease	corticosteroid	392.5	1.8	3	5	2	94.8
Hydrocortisone	5754	C[C@]12CCC(=O)C=C1CC[C@@H]3[C@@H]2[C@H](C[C@]4([C@H]3CC[C@]4(C(=O)CO)O)C)O	Adrenal insufficiency and inflammation	corticosteroid	362.5	1.6	3	5	2	94.8
Fluticasone	5311101	C[C@@H]1C[C@H]2[C@@H]3C[C@@H](C4=CC(=O)C=C[C@@]4(C)[C@@]3(C[C@@H]([C@@]2(C)[C@]1(C(=O)SCF)O)O)F)F	Asthma and COPD	corticosteroid	444.5	3.0	2	5	3	96.3
Budesonide	5281004	CCCC1O[C@@H]2C[C@H]3[C@@H]4CCC5=CC(=O)C=C[C@]5(C)[C@H]4[C@@H](O)C[C@]3(C)[C@]2(O1)C(=O)CO	Asthma and inflammatory bowel disease	corticosteroid	430.5	2.5	3	6	4	93.1
Sildenafil	5212	CCCC1=NN(C2=C1N=C(NC2=O)C3=C(C=CC(=C3)S(=O)(=O)N4CCN(CC4)C)OCC)C	Erectile dysfunction	PDE5 inhibitor	474.6	1.9	1	9	7	113.4
Tadalafil	110635	CN1CC(=O)N2[C@H](CC3=C(C2C4=CC5=C(C=C4)OCO5)NC6=CC=CC=C63)C1=O	Erectile dysfunction	PDE5 inhibitor	389.4	2.3	1	6	1	74.9
Levothyroxine	5819	C1=C(C=C(C(=C1I)OC2=CC(=C(C(=C2)I)O)I)I)C[C@@H](C(=O)O)N	Hypothyroidism	thyroid hormone	776.9	2.3	3	4	5	92.8
Alendronate	2088	C(CC(PO(=O)(O)O)(PO(=O)(O)O)O)CN	Osteoporosis	bisphosphonate	249.1	-4.3	6	8	5	189.0
Allopurinol	135401907	C1=NNC2=C1C(=O)NC=N2	Gout	xanthine oxidase inhibitor	136.1	-0.6	2	4	0	74.4
Colchicine	6167	COC1=CC=C2C(=C1OC)C3=CC(=C(C(=C3CC[C@H]2NC(=O)C)OC)OC)OC	Gout	anti-gout	399.4	1.0	1	7	6	83.1
Methotrexate	126941	CN(CC1=CN=C2C(=N1)C(=NC(=N2)N)N)C3=CC=C(C=C3)C(=O)N[C@@H](CCC(=O)O)C(=O)O	Rheumatoid arthritis and cancer	antimetabolite	454.4	-1.8	5	12	9	210.5
Hydroxychloroquine	3652	CCN(CCO)CCCC(C)NC1=CC=NC2=CC(=CC=C21)Cl	Malaria and autoimmune disease	antimalarial	335.9	3.0	2	4	9	48.4
Tamoxifen	2733526	CC/C(=C(/C1=CC=CC=C1)\\C2=CC=C(C=C2)OCCN(C)C)/C3=CC=CC=C3	Estrogen receptor-positive breast cancer	SERM	371.5	6.3	0	2	8	12.5
Anastrozole	2187	CC(C)(C#N)C1=CC(=CC(=C1)CN2C=NC=N2)C(C)(C)C#N	Hormone receptor-positive breast cancer	aromatase inhibitor	293.4	2.4	0	5	3	78.3
Letrozole	3902	N#CC1=CC=C(C=C1)C(C2=CC=C(C=C2)C#N)N3C=NC=N3	Hormone receptor-positive breast cancer	aromatase inhibitor	285.3	2.5	0	5	3	78.3
Finasteride	57363	C[C@]12CC[C@H]3[C@H]([C@@H]1CC[C@@H]2C(=O)NC(C)(C)C)CC[C@@H]4[C@@]3(C=CC(=O)N4)C	Benign prostatic hyperplasia	5-alpha reductase inhibitor	372.5	3.0	2	3	2	58.2
Tamsulosin	129211	CCOC1=CC=CC=C1OCCN[C@H](C)CC2=CC(=C(C=C2)OC)S(=O)(=O)N	Benign prostatic hyperplasia	alpha-1 blocker	408.5	2.2	2	6	10	102.0
Montelukast	5281040	CC(C)(C1=CC=C(C=C1)S(=O)(=O)NC2=CC=CC=C2C3=CSC4=C3C=CC=C4Cl)C5=CC=CC=C5CCC(=O)O	Asthma and allergic rhinitis	leukotriene antagonist	586.2	7.9	2	5	11	108.2
Salbutamol	2083	CC(C)(C)NCC(C1=CC(=C(C=C1)O)CO)O	Asthma	beta-2 agonist	239.3	0.3	4	4	5	72.7
Theophylline	2153	CN1C2=C(C(=O)N(C1=O)C)NC=N2	Asthma and COPD	xanthine	180.2	-0.0	1	6	0	69.3
Caffeine	2519	CN1C=NC2=C1C(=O)N(C(=O)N2C)C	Alertness (and apnea of prematurity)	xanthine	194.2	-0.1	0	6	0	58.4
Ranitidine	5039	CNC(=C[N+](=O)[O-])NCCSCC1=CC=C(O1)CN(C)C	GERD and peptic ulcer	H2 antagonist	314.4	0.3	2	7	8	111.5
Famotidine	5702160	C1=C(N=C(S1)N=C(N)N)CSCCC(=N)NS(=O)(=O)N	GERD and peptic ulcer	H2 antagonist	337.4	-0.6	4	8	7	175.5
Ondansetron	4595	CC1=NC=CN1CC2=C(C3=CC=CC=C3N2C)C(=O)C4CCCN4C	Chemotherapy-induced nausea	5-HT3 antagonist	293.4	2.4	0	4	3	39.8
Sumatriptan	5358	CNS(=O)(=O)CC1=CC2=C(C=C1)NC=C2CCN(C)C	Migraine	triptan	295.4	0.7	2	4	6	73.5
Zolpidem	5732	CC1=CC=C(C=C1)C2=C(N3C=C(C=CC3=N2)C)CC(=O)N(C)C	Insomnia	Z-drug	307.4	2.5	0	3	4	37.6
Diazepam	3016	CN1C2=C(C=C(C=C2)Cl)C(=NC(C1=O)C3=CC=CC=C3)	Anxiety	benzodiazepine	284.7	3.0	0	3	1	32.7
Lorazepam	3958	C1=CC=C(C=C1)C2=NC(C(=O)NC3=C2C=C(C=C3)Cl)O	Anxiety	benzodiazepine	321.2	2.4	2	4	1	61.7
Alprazolam	2118	CC1=NN=C2N1C3=C(C=C(C=C3)Cl)C(=NC2)C4=CC=CC=C4	Anxiety	benzodiazepine	308.8	2.1	0	4	1	43.1
Donepezil	3152	COC1=C(C=C2C(=C1)CC(CC2=O)CC3CCN(CC3)CC4=CC=CC=C4)OC	Alzheimer disease	cholinesterase inhibitor	379.5	4.1	0	4	6	38.8
Memantine	4054	CC12CC3CC(C1)(CC(C3)(C2)N)C	Alzheimer disease	NMDA antagonist	179.3	3.3	1	1	0	26.0
Levodopa	6047	C1=CC(=C(C=C1C[C@@H](C(=O)O)N)O)O	Parkinson disease	dopamine precursor	197.2	-2.7	4	5	3	103.8
Carbidopa	34359	C[C@@](CC1=CC(=C(C=C1)O)O)(C(=O)O)NN	Parkinson disease (with levodopa)	DDC inhibitor	226.2	-1.9	5	6	4	115.8
Amantadine	2130	C1C2CC3CC1CC(C2)(C3)N	Parkinson disease and influenza A	adamantane	151.3	2.4	1	1	0	26.0
Modafinil	4236	NS(=O)(=O)C(C1=CC=CC=C1)C2=CC=CC=C2C(=O)N	Narcolepsy	wakefulness agent	273.4	1.7	2	4	4	80.3
Methylphenidate	4158	C[C@@H](C1=CC=CC=C1)[C@@H]2CCCCN2C(=O)OC	ADHD	stimulant	233.3	2.3	1	3	4	38.3
Atomoxetine	54841	CC1=CC=CC=C1O[C@H](C)CCNC	ADHD	NRI	255.4	3.7	1	2	6	21.3
Varenicline	5310966	C1C2CNCC1C3=CC4=C(C=C23)N=CN=C4	Smoking cessation	nAChR partial agonist	211.3	1.0	1	3	0	37.8
Nicotine	942	CN1CCC[C@H]1C2=CN=CC=C2	Smoking cessation (NRT)	nAChR agonist	162.2	1.2	0	2	1	16.1
Atropine	174174	CN1C2CCC1CC(C2)OC(=O)C(CO)C3=CC=CC=C3	Bradycardia and organophosphate poisoning	antimuscarinic	289.4	1.8	1	4	5	49.8
Scopolamine	3000322	CN1[C@@H]2C[C@H](C[C@H]1[C@H]3O[C@@H]23)OC(=O)[C@H](CO)C4=CC=CC=C4	Motion sickness	antimuscarinic	303.4	0.9	1	5	5	62.3
Prazosin	4893	COC1=C(C=C2C(=C1)C(=NC(=N2)N3CCN(CC3)C(=O)C4=CC=CO4)N)OC	Hypertension	alpha-1 blocker	383.4	1.3	1	8	4	107.0
Clonidine	2803	C1CN=C(N1)NC2=C(C=CC=C2Cl)Cl	Hypertension	alpha-2 agonist	230.1	1.6	2	2	1	36.4
Losartan potassium	11751549	CCCCC1=NC(=C(N1CC2=CC=C(C=C2)C3=CC=CC=C3C4=NNN=N4)Cl)CO	Hypertension	ARB	461.0	4.5	2	7	8	92.5
Furosemide	3440	C1=C(C=C(C(=C1Cl)S(=O)(=O)N)C(=O)O)NCC2=CC=CO2	Edema and hypertension	loop diuretic	330.7	2.0	3	6	4	122.6
Hydrochlorothiazide	3639	C1NC2=CC(=C(C=C2S(=O)(=O)N1)S(=O)(=O)N)Cl	Hypertension	thiazide diuretic	297.7	-0.1	3	6	1	135.1
Spironolactone	5833	CC1C2CCC3C(C(=O)CC)CCC3(C)C2CCC4(C)C1C=CC4=O	Heart failure and hyperaldosteronism	MRA	416.6	2.9	0	4	2	60.4
Amiodarone	2157	CCCCC1=C(C2=CC=CC=C2O1)C(=O)C3=CC(=C(C(=C3)I)OCCN(CC)CC)I	Ventricular and atrial arrhythmias	antiarrhythmic	645.3	7.6	0	4	11	42.7
Digoxin	2724385	C[C@H]1O[C@H](C[C@H](O)[C@@H]1O)O[C@H]2[C@@H](O)C[C@H](O[C@H]3CC[C@]4(C)[C@H]5C[C@@H](O)[C@]6(C)[C@@H](CC[C@]6(O)C5CC[C@@H]4C3)C7=CC(=O)OC7)O[C@@H]2C	Heart failure and atrial fibrillation	cardiac glycoside	780.9	1.3	6	14	7	203.1
Lidocaine	3676	CCN(CC)CC(=O)NC1=C(C)C=CC=C1C	Local anesthesia and ventricular arrhythmias	local anesthetic	234.3	2.3	1	3	5	32.3
Phenylephrine	6041	CNCC(C1=CC(=CC=C1)O)O	Nasal congestion and hypotension	alpha-1 agonist	167.2	-0.3	3	3	3	52.5
Pseudoephedrine	7028	C[C@@H]([C@@H](C1=CC=CC=C1)O)NC	Nasal congestion	decongestant	165.2	0.9	2	2	3	32.3
Dextromethorphan	5360696	CN1CC[C@@]23CCCC[C@@H]2[C@@H]1CC4=C3C=C(C=C4)OC	Cough	antitussive	271.4	3.6	0	2	1	12.5
Guaifenesin	3516	COC1=CC=CC=C1OCC(O)CO	Cough with mucus	expectorant	198.2	-0.1	2	4	5	58.9
Ibuprofen lysinate	72192	CC(C)CC1=CC=C(C=C1)C(C)C(=O)O	Pain and inflammation	NSAID	206.3	3.5	1	2	4	37.3
Ketorolac	3826	C1CN2C(=CC=C2C(=O)C3=CC=CC=C3)C1C(=O)O	Moderate to severe pain	NSAID	255.3	2.1	1	4	3	59.3
Piroxicam	5280452	CN1C(=C(C2=CC=CC=C2S1(=O)=O)O)C(=O)NC3=CC=CC=N3	Osteoarthritis	NSAID	331.3	3.1	2	6	2	107.9
Acetaminophen	1983	CC(=O)NC1=CC=C(C=C1)O	Pain and fever	analgesic	151.2	0.5	2	2	1	49.3
Meperidine	4058	CCOC(=O)C1(CCN(CC1)C)C2=CC=CC=C2	Moderate to severe pain	opioid analgesic	247.3	2.7	0	3	4	29.5
Fentanyl	3345	CCC(=O)N(C1CCN(CC1)CCC2=CC=CC=C2)C3=CC=CC=C3	Severe pain	opioid analgesic	336.5	4.0	0	2	7	23.6
Methadone	4095	CCC(=O)C(CC(C)N(C)C)(C1=CC=CC=C1)C2=CC=CC=C2	Opioid use disorder and pain	opioid analgesic	309.4	3.9	0	2	7	20.3
Buprenorphine	644073	CO[C@]12CC[C@@]3(C[C@@H]1[C@](C)(O)C(C)(C)C)[C@H]4CC5=C6C(=C(O)C=C5)O[C@@H]2[C@]63CCN4CC7CC7	Opioid use disorder	opioid partial agonist	467.6	4.5	2	5	2	62.2
Naltrexone	5360515	CC(C1CC1)N2CC[C@]34[C@@H]5[C@H]2CC6=C3C(=C(C=C6)O)O[C@H]4C(=O)C[C@@H]5O	Opioid and alcohol use disorder	opioid antagonist	341.4	1.4	2	5	2	70.0
Chloroquine	2719	CCN(CC)CCCC(C)NC1=CC=NC2=CC(=CC=C21)Cl	Malaria	antimalarial	319.9	4.6	1	3	8	28.2
Artemether	68911	C[C@@H]1CC[C@H]2[C@H](C)O[C@@H]3O[C@@]4(C)CC[C@@H]5[C@H](C)CC[C@]2(OO4)[C@]35C	Malaria	antimalarial	298.4	3.0	0	5	0	36.9
Ivermectin	6321424	CCC(C)C1OC(=O)C2CCCCN2C(=O)C(=O)C3(O)CCC(C)C(OC4CCC(C)C(OC5CCC(C)C(O)C5OC)O4)C(C)C=CC=C6COC7C(O)C(C)=CC(C(=O)O7)C6O	Parasitic infections	anthelmintic	875.1	4.4	3	14	8	170.1
Albendazole	2082	CCCSC1=CC2=C(C=C1)N=C(N2)NC(=O)OC	Helminth infections	anthelmintic	265.3	2.9	2	5	5	92.3
Mebendazole	4030	COC(=O)NC1=NC2=C(N1)C=C(C=C2)C(=O)C3=CC=CC=C3	Helminth infections	anthelmintic	295.3	2.8	2	5	3	92.3
Fluconazole	3365	C1=CC(=C(C=C1F)F)C(CN2C=NC=N2)(CN3C=NC=N3)O	Fungal infections	azole antifungal	306.3	0.4	1	7	5	81.6
Itraconazole	55283	CCC(C)N1C(=O)N(C=N1)C2=CC=C(C=C2)N3CCN(CC3)C4=CC=C(C=C4)OCC5COC(O5)(CN6C=NC=N6)C7=C(C=C(C=C7)Cl)Cl	Fungal infections	azole antifungal	705.6	5.7	0	12	11	100.8
Terbinafine	1549008	CC(C)(C)C#C/C=C/CN(C)CC1=CC=CC2=CC=CC=C21	Fungal skin infections	allylamine antifungal	291.4	5.9	0	1	4	3.2
Clotrimazole	2812	C1=CC=C(C=C1)C(C2=CC=CC=C2)(C3=CC=CC=C3Cl)N4C=CN=C4	Fungal skin infections	azole antifungal	344.8	5.0	0	2	4	17.8
Rifampin	5381226	CC1C=CC=C(C(=O)NC2=C(C3=C(C4=C(C(=C3O)C)OC(C4=O)(OC=CC(C(C(C(C(C(C1O)C)O)C)OC(=O)C)C)OC)C)C5=C2C=C(C=C5O)C=NN6CCN(CC6)C)O)C	Tuberculosis	rifamycin	822.9	4.0	6	15	5	220.2
Isoniazid	3767	C1=CN=CC=C1C(=O)NN	Tuberculosis	antitubercular	137.1	-0.7	3	4	1	68.0
Pyrazinamide	1046	C1=CN=C(C=N1)C(=O)N	Tuberculosis	antitubercular	123.1	-0.6	1	4	1	68.9
Ethambutol	14052	CC[C@@H](CO)NCCN[C@@H](CC)CO	Tuberculosis	antitubercular	204.3	-0.1	4	4	9	64.5
Dolutegravir	54726191	CC1CCOC2C1N(C=C(C2=O)C(=O)NCC3=C(C=C(C=C3)F)F)CC(=O)N	HIV	integrase inhibitor	419.4	1.2	2	8	4	99.2
Efavirenz	64139	C1=CC(=CC(=C1)Cl)C2(C3=C(C=C(C=C3)Cl)NC(=O)O2)C(F)(F)F	HIV	NNRTI	315.7	4.5	1	3	1	38.3
Ritonavir	392622	CC(C)C1=NC(=CS1)CN(C)C(=O)N[C@@H](C(C)C)C(=O)N[C@@H](CC2=CC=CC=C2)C[C@H](C(=O)NC(C)(C)C)CC3=CC=CC=C3	HIV	protease inhibitor	720.9	6.0	4	9	18	202.0
Lopinavir	92727	CC(C)C1=NC(=CS1)CN(C)C(=O)N[C@@H](C(C)C)C(=O)N[C@H](C[C@H](O)[C@H](CC2=CC=CC=C2)NC(=O)C(C)(C)C)CC3=CC=CC=C3	HIV	protease inhibitor	628.8	5.9	4	8	17	120.0
Remdesivir	121304016	CCC(CC)COC(=O)[C@H](C)N[P@](=O)(OC[C@@H]1[C@H]([C@H]([C@](O1)(C#N)C2=CC=C3N2N=CN=C3N)O)O)OC4=CC=CC=C4	COVID-19	antiviral	602.6	2.0	4	13	14	204.0
Molnupiravir	145996610	CC(=O)OC[C@@H]1[C@H]([C@H]([C@@H](O1)N2C=CC(=NC2=O)NO)O)O	COVID-19	antiviral	329.3	-1.0	4	9	4	143.1
Paxlovid	155903259	CC(C)C[C@H](NC(=O)[C@@H]1[C@@H]2[C@@H](C2(C)C)CN1C(=O)[C@H](C(C)(C)C)NC(=O)C(F)(F)F)C(=O)N[C@@H]3C[C@H]4CCN4C3=O	COVID-19	antiviral	499.5	2.5	3	8	10	131.4
Nirmatrelvir	155903259	CC(C)C[C@H](NC(=O)[C@@H]1[C@@H]2[C@@H](C2(C)C)CN1C(=O)[C@H](C(C)(C)C)NC(=O)C(F)(F)F)C(=O)N[C@@H]3C[C@H]4CCN4C3=O	COVID-19	antiviral	499.5	2.5	3	8	10	131.4
Dexamethasone phosphate	441406	C[C@@H]1C[C@H]2[C@@H]3CCC4=CC(=O)C=C[C@@]4(C)[C@@]3(F)[C@@H](O)C[C@@]2(C)[C@]1(O)C(=O)COP(=O)(O)O	Inflammatory disease	corticosteroid	472.4	0.7	4	8	4	161.4
Cyclosporine	5284373	CCC1C(=O)N(CC(=O)N(C(C(=O)NC(C(=O)N(C(C(=O)NC(C(=O)NC(C(=O)N(C(C(=O)N(C(C(=O)N(C1=O)C)C(C)C)CC(C)C)C)CC(C)C)C)C)C)CC(C)C)C)C(C)C)CC(C)C)C	Transplant rejection	calcineurin inhibitor	1202.6	2.9	5	23	15	278.8
Tacrolimus	445643	C[C@@H]1C[C@@H](CC[C@H]1O)C=C(C)[C@@H]2OC(=O)[C@@H]3CCCCN3C(=O)C(=O)[C@](O)(CC[C@@H](C)C[C@@H](OC)[C@H]4O[C@](O)(CC[C@H]4C)C[C@@H](OC)/C=C/C=C/2C)	Transplant rejection	calcineurin inhibitor	804.0	5.7	3	12	7	178.4
Mycophenolate mofetil	5281078	COC1=C(C)C2=C(C(=O)O[C@H](C2)C/C=C(\\C)/CCC(=O)OCCN3CCOCC3)C(=C1O)C	Transplant rejection	immunosuppressant	433.5	2.8	1	8	10	105.0
Azathioprine	2265	CN1C=NC(=C1N=NC2=C(N=CN2)[N+](=O)[O-])S	Transplant rejection and autoimmune disease	immunosuppressant	277.3	0.1	1	9	3	118.1
Leflunomide	3899	CC1=C(C=NO1)C(=O)NC2=CC=C(C=C2)C(F)(F)F	Rheumatoid arthritis	DMARD	270.2	2.8	1	4	3	55.1
Sulfasalazine	5339	C1=CC=C(C=C1)C(=O)NC2=CC=C(C=C2)/N=N/C3=C(C=CC(=C3)C(=O)O)O	Rheumatoid arthritis and IBD	DMARD	398.4	3.7	3	9	6	141.3
Mesalamine	4075	C1=CC(=C(C=C1N)C(=O)O)O	Ulcerative colitis	5-ASA	153.1	0.8	3	4	1	83.6
Ondansetron hydrochloride	62959	CC1=NC=CN1CC2=C(C3=CC=CC=C3N2C)C(=O)C4CCCN4C	Chemotherapy-induced nausea	5-HT3 antagonist	329.8	2.4	0	4	3	39.8
Metoclopramide	4168	CCN(CC)CCNC(=O)C1=CC(=C(C=C1OC)N)Cl	Nausea and gastroparesis	prokinetic	299.8	2.6	2	4	7	67.6
Domperidone	3151	C1CN(CCN1CCCCN2C(=O)NC3=CC=CC=C32)C4=CC=C(C=C4)Cl	Nausea	D2 antagonist	425.9	3.9	1	5	7	65.8
Loperamide	3955	CN(C)C(=O)C(CCN1CCC(CC1)(C2=CC=CC=C2)C3=CC=CC=C3)(C4=CC=CC=C4)O	Diarrhea	opioid antimotility	477.0	5.0	1	4	8	43.8
Omeprazole magnesium	9952946	CC1=CN=C(C(=C1OC)C)CS(=O)C2=NC3=C(N2)C=C(C=C3)OC	GERD	PPI	345.4	2.2	1	6	5	96.3
Ranitidine hydrochloride	3033332	CNC(=C[N+](=O)[O-])NCCSCC1=CC=C(O1)CN(C)C	GERD	H2 antagonist	350.9	0.3	2	7	8	111.5
Cimetidine	2756	CC1=C(N=CN1)CSCCNC(=NC)NC#N	GERD and peptic ulcer	H2 antagonist	252.3	0.4	3	6	6	88.9
Misoprostol	5282381	CCCCC(C)(C=CC1C(CC(=O)C1CCCCCCC(=O)OC)O)O	NSAID ulcer prevention and labor induction	prostaglandin analog	382.5	3.7	2	5	13	83.8
Lactulose	11333	C([C@@H]1[C@@H]([C@@H]([C@H]([C@@H](O1)O[C@]2(C[C@H]([C@@H]([C@@H](O2)CO)O)O)CO)O)O)O)O	Constipation and hepatic encephalopathy	osmotic laxative	342.3	-4.3	8	11	5	189.5
Polyethylene glycol 3350	174	OCCO	Constipation	osmotic laxative	62.1	-1.4	2	2	1	40.5
Bisacodyl	2391	CC(=O)OC1=CC=C(C=C1)C(C2=CC=C(C=C2)OC(=O)C)C3=CC=CC=N3	Constipation	stimulant laxative	361.4	3.6	0	6	6	78.7
Docusate	23673837	CCCCCCCCC(CCCCCC)C(=O)OCCOP(=O)([O-])OCC	Constipation	stool softener	421.6	6.0	0	7	20	97.4
Senna	16219508	C1=CC(=C2C(=C1)C(=O)C3=C(C=C(C=C3C2=O)O)O)O	Constipation	stimulant laxative	270.2	2.0	3	5	0	94.8
Allopurinol sodium	23664707	C1=NNC2=C1C(=O)NC=N2	Gout	xanthine oxidase inhibitor	136.1	-0.6	2	4	0	74.4
Febuxostat	134018	CC1=C(C=C(C=C1)C#N)C2=NC(=C(S2)C(=O)O)C	Gout	xanthine oxidase inhibitor	316.4	3.9	1	5	3	107.1
Probenecid	4913	CCCN(CCC)S(=O)(=O)C1=CC=C(C=C1)C(=O)O	Gout (uricosuric)	uricosuric	285.4	3.2	1	5	6	74.6
Rasagiline	3052776	C[C@H](C#C)N[C@@H]1CCC2=CC=CC=C12	Parkinson disease	MAO-B inhibitor	171.2	2.3	1	1	1	12.0
Selegiline	26757	C[C@H](CC1=CC=CC=C1)N(C)CC#C	Parkinson disease	MAO-B inhibitor	187.3	2.7	0	1	4	3.2
Entacapone	5281081	CCN(CC)C(=O)/C(=C/C1=CC(=C(C(=C1)O)O)[N+](=O)[O-])/C#N	Parkinson disease	COMT inhibitor	305.3	2.1	2	7	6	127.7
Pramipexole	119570	CCCN[C@H]1CCC2=C(C1)SC(=N2)N	Parkinson disease	dopamine agonist	211.3	1.4	3	3	4	67.2
Ropinirole	5095	CCCN(CCC)CCC1=CC=C2C(=C1)CC(=O)N2	Parkinson disease	dopamine agonist	260.4	2.7	1	3	7	32.3
Rotigotine	59227	CCCN1CCC(CC1)CSC2=CC=CC3=C2C=CC(=C3)O	Parkinson disease	dopamine agonist	315.5	4.8	1	3	6	32.7
Zolpidem tartrate	5732	CC1=CC=C(C=C1)C2=C(N3C=C(C=CC3=N2)C)CC(=O)N(C)C	Insomnia	Z-drug	307.4	2.5	0	3	4	37.6
Eszopiclone	969472	CN1C(=O)C=CC2=C1N=C(C=N2)C3=CC=C(C=N3)Cl	Insomnia	Z-drug	388.8	1.0	0	6	3	83.4
Trazodone	5533	C1CN(CCN1CCCN2C(=O)N3C=CC=CC3=N2)C4=CC=C(C=C4)Cl	Depression and insomnia	SARI	371.9	2.9	0	5	5	45.8
Mirtazapine	4205	CN1CCN2C(C1)C3=CC=CC=C3CC4=C2N=CC=C4	Depression	NaSSA	265.4	2.9	0	3	0	19.4
Lithium carbonate	11125	[Li+].[Li+].[O-]C(=O)[O-]	Bipolar disorder	mood stabilizer	73.9	-3.0	0	3	0	63.2
Lurasidone	213046	CC1CCC2C(C1)C(=O)N(C2=O)CCCCN3CCN(CC3)C4=NSC5=CC=CC=C54	Schizophrenia	antipsychotic	492.7	5.6	0	6	7	84.9
Lamotrigine	3878	C1=CC(=C(C(=C1)Cl)Cl)C2=C(N=C(N=N2)N)N	Epilepsy	anticonvulsant	256.1	1.9	2	5	1	90.7
Oxcarbazepine	34312	C1=CC=C2C(=C1)C=CC3=CC=CC=C3N(C2=O)C(=O)N	Epilepsy	anticonvulsant	252.3	1.7	2	4	1	66.6
Lacosamide	219078	COC[C@@H](NC(=O)C)C(=O)NCC1=CC=CC=C1	Epilepsy	anticonvulsant	250.3	0.3	2	4	6	67.4
Clobazam	2789	CN1C2=C(C=C(C=C2)Cl)N(C(=O)CC1=O)C3=CC=CC=C3	Epilepsy and anxiety	benzodiazepine	300.7	2.1	0	3	1	40.6
Clonazepam	2802	C1C(=O)NC2=C(C=C(C=C2)[N+](=O)[O-])C(=N1)C3=CC=CC=C3Cl	Epilepsy and panic disorder	benzodiazepine	315.7	2.4	1	5	2	87.3
Midazolam	4192	CC1=NC=C2C(=N1)C3=C(C=CC(=C3)Cl)C(=N2)C4=CC=CC=C4F	Procedural sedation	benzodiazepine	325.8	3.9	0	3	1	30.2
Propofol	4943	CC(C)C1=C(C(=CC=C1)C(C)C)O	General anesthesia	anesthetic	178.3	3.8	1	1	2	20.2
Ketamine	3821	CNC1(CCCCC1=O)C2=CC=CC=C2Cl	Anesthesia and depression	NMDA anesthetic	237.7	2.2	1	2	2	29.1
Etomidate	667484	CCOC(=O)C1=CN=CN1C(C)C2=CC=CC=C2	Anesthesia induction	anesthetic	244.3	3.0	0	4	4	44.1
Succinylcholine	5314	C[N+](C)(C)CCOC(=O)CCC(=O)OCC[N+](C)(C)C	Neuromuscular blockade	depolarizing NMB	290.4	-4.2	0	4	8	52.6
Rocuronium	441290	CC(=O)O[C@H]1C[C@@H]2CC[C@@H]3[C@H]([C@]2(CC[C@H]1N4CCOCC4)C)CC[C@]5([C@H]3C[C@H]([C@@H]5[N+]6(CCCC6)CC=C)O)C	Neuromuscular blockade	aminosteroid NMB	529.8	2.6	1	5	6	62.2
Neostigmine	4456	CN(C)C(=O)OC1=CC=CC(=C1)[N+](C)(C)C	Myasthenia gravis and reversal of blockade	cholinesterase inhibitor	223.3	-2.2	0	3	3	29.5
Pyridostigmine	4991	CN(C)C(=O)OC1=CC=C[N+](=C1)C	Myasthenia gravis	cholinesterase inhibitor	181.2	-3.0	0	3	2	33.4
Edrophonium	8248	CC[N+](C)(C)C1=CC=CC(=C1)O	Myasthenia gravis diagnosis	cholinesterase inhibitor	166.2	-1.8	1	2	2	20.2
Atorvastatin calcium	60823	CC(C)C1=C(C(=C(N1CC[C@H](C[C@H](CC(=O)O)O)O)C2=CC=C(C=C2)F)C3=CC=CC=C3)C(=O)NC4=CC=CC=C4	Hypercholesterolemia	statin	558.6	5.4	4	6	12	111.8
Ezetimibe	150311	C1=CC(=CC=C1[C@H]2[C@@H](N(C(=O)C2)C3=CC=C(C=C3)F)CC[C@H](C4=CC=C(C=C4)O)O)F	Hypercholesterolemia	cholesterol absorption inhibitor	409.4	4.0	2	4	6	60.8
Fenofibrate	3339	CC(C)OC(=O)C(C)(C)OC1=CC=C(C=C1)C(=O)C2=CC=C(C=C2)Cl	Hypertriglyceridemia	fibrate	360.8	5.2	0	4	6	52.6
Gemfibrozil	3463	CC1=CC(=C(C=C1)C)OCCCC(C)(C)C(=O)O	Hypertriglyceridemia	fibrate	250.3	3.6	1	3	5	46.5
Niacin	938	C1=CC(=CN=C1)C(=O)O	Dyslipidemia and niacin deficiency	vitamin	123.1	0.4	1	3	1	50.2
Isosorbide mononitrate	27661	C1[C@H]2[C@@H](C[C@H](O1)O2)O[N+](=O)[O-]	Angina	nitrate	191.1	-0.4	1	6	2	83.8
Nitroglycerin	4510	C(C(CO[N+](=O)[O-])O[N+](=O)[O-])O[N+](=O)[O-]	Angina	nitrate	227.1	1.6	0	9	8	165.2
Ranolazine	56959	COC1=CC=CC(=C1)CN2CCN(CC2)CC(=O)NC3=C(C=CC=C3C)C	Chronic angina	antianginal	427.5	2.7	1	6	8	65.1
Ivabradine	132999	COC1=CC2=C(C=C1OC)CCN(C2)C[C@H](C)CC3=CC4=C(C=C3)CCN(C4=O)CCC5CC5	Heart-failure rate control	If inhibitor	468.6	3.2	0	6	9	51.2
Sacubitril	9811834	CCOC(=O)C[C@H](C[C@@H](C)C(=O)N[C@@H](CC1=CC=CC=C1)C(=O)O)CC2=CC=C(C=C2)C3=NN=NN3	Heart failure (with valsartan)	neprilysin inhibitor	411.5	3.3	2	8	12	141.1
Empagliflozin	11949646	C1CO[C@H](C1)C2=CC=C(C=C2)CC3=C(C=C(C=C3)[C@H]4[C@@H]([C@H]([C@@H]([C@H](O4)CO)O)O)O)Cl	Type 2 diabetes and heart failure	SGLT2 inhibitor	450.9	2.3	4	6	5	110.0
Canagliflozin	24812758	CC1=C(C=C(S1)C2=CC=C(C=C2)F)CC3=C(C=C(C=C3)[C@H]4[C@@H]([C@H]([C@@H]([C@H](O4)CO)O)O)O)	Type 2 diabetes	SGLT2 inhibitor	444.5	3.4	4	6	5	99.4
Linagliptin	10096344	CC#CCN1C2=C(N=C1N3CCCC(C3)N)N(C(=O)N(C2=O)CC4=NC5=CC=CC=C5C(=N4)C)C	Type 2 diabetes	DPP-4 inhibitor	472.5	2.6	1	9	4	102.8
Liraglutide	16134956	CCCCCCCCCCCCCCCC(=O)N[C@@H](CCC(=O)NCCCC[C@@H](C(=O)N[C@@H](CCC(=O)O)C(=O)N[C@@H](CC1=CC=CC=C1)C(=O)N[C@@H](CC(=O)O)C(=O)N[C@@H](CO)C(=O)N[C@@H](CO)C(=O)N[C@@H](CC2=CNC=N2)C(=O)N[C@@H]([C@@H](C)CC)C(=O)N[C@@H](C)C(=O)N[C@@H](CC3=CC=CC=C3)C(=O)N[C@@H]([C@@H](C)O)C(=O)N[C@@H](CC(=O)O)C(=O)N[C@@H](CCCCN)C(=O)N[C@@H](CC4=CNC5=CC=CC=C54)C(=O)NCC(=O)NCC(=O)N6CCC[C@H]6C(=O)N[C@@H](CCC(=O)N)C(=O)N[C@@H](CCCCN)C(=O)O)NC(=O)[C@H](C)NC(=O)[C@H](C)NC(=O)[C@H](CCC(=O)N)NC(=O)CNC(=O)[C@H](CCC(=O)O)NC(=O)[C@H](CC(C)C)NC(=O)[C@H](CC7=CC=C(C=C7)O)NC(=O)[C@H](CO)NC(=O)[C@H](CC8=CNC=N8)NC(=O)[C@H](CC(=O)N)NC(=O)[C@H](CC(=O)O)NC(=O)[C@H](CO)NC(=O)[C@@H](NC(=O)[C@H](CC9=CC=CC=C9)N)[C@@H](C)O)C(=O)O	Type 2 diabetes	GLP-1 analog	3751.2	-3.0	50	80	80	1500.0
Semaglutide	56843331	CCCCCCCCCCCCCCCCCC(=O)N[C@@H](CCC(=O)NCCCC[C@@H](C(=O)N[C@@H](CCC(=O)O)C(=O)N[C@@H](CC1=CC=CC=C1)C(=O)O)NC(=O)[C@H](C)N)C(=O)O	Type 2 diabetes and obesity	GLP-1 analog	4113.6	-3.0	50	80	80	1500.0
Insulin glargine	118984454	CC[C@H](C)[C@H](NC(=O)CN)C(=O)N	Diabetes	peptide hormone	6063.0	-4.0	80	100	100	2000.0
Warfarin sodium	54678486	CC(=O)CC(C1=CC=CC=C1)C2=C(C3=CC=CC=C3OC2=O)O	Thromboembolism prevention	anticoagulant	330.3	2.7	1	4	4	67.5
Enoxaparin	772	CC(=O)NC1C(C(C(OC1O)COS(=O)(=O)O)O)O	VTE prevention	LMWH	4500.0	-8.0	20	40	20	800.0
Heparin	772	CC(=O)NC1C(C(C(OC1O)COS(=O)(=O)O)O)O	Anticoagulation	anticoagulant	15000.0	-10.0	40	80	40	2000.0
Aspirin lysine	2244	CC(=O)OC1=CC=CC=C1C(=O)O	Antiplatelet use	NSAID	180.2	1.2	1	4	3	63.6
Prasugrel	6917148	CC1=C(C2=C(S1)N(CC2)C(=O)C3=CC=CC=C3C)CC(=O)OC	Acute coronary syndrome	P2Y12 inhibitor	373.4	3.6	0	5	6	56.8
Ticagrelor	9871419	CCCSC1=NC2=C(C(=N1)N[C@@H]3C[C@H]([C@@H]([C@H]3O)O)O)N=NN2[C@@H]4C[C@H](OC4)CCO	Acute coronary syndrome	P2Y12 inhibitor	522.6	2.1	4	10	8	158.0
Dipyridamole	3108	C1COCCN1C2=NC(=C3C(=N2)N(C=N3)CCO)N4CCOCC4	Stroke prevention	antiplatelet	504.6	1.5	4	12	12	145.4
Cilostazol	2754	C1CCC(CC1)N2C(=O)C3=C(N=C2CCCCC4=NN=NN4)C=CC(=C3)OCCCCC5CCCC5	Intermittent claudication	PDE3 inhibitor	369.5	3.4	1	6	8	83.6
Pentoxifylline	4740	CN1C=NC2=C1C(=O)N(C(=O)N2C)CCCCC(=O)C	Intermittent claudication	xanthine	278.3	0.2	0	6	5	75.4
Sildenafil citrate	5212	CCCC1=NN(C2=C1N=C(NC2=O)C3=C(C=CC(=C3)S(=O)(=O)N4CCN(CC4)C)OCC)C	Erectile dysfunction	PDE5 inhibitor	474.6	1.9	1	9	7	113.4
Vardenafil	110634	CC1=C(C2=C(N1)C(=O)N(C=N2)C)C3=C(C=CC(=C3)S(=O)(=O)N4CCN(CC4)CC)OCC	Erectile dysfunction	PDE5 inhibitor	488.6	2.1	1	9	8	109.0
Alprostadil	5280723	CCCCC[C@H](O)/C=C/[C@H]1[C@H](O)C[C@H](O)[C@@H]1CCCCCCC(=O)O	Erectile dysfunction and PDA	prostaglandin	354.5	3.2	3	5	13	94.8
Tamsulosin hydrochloride	129211	CCOC1=CC=CC=C1OCCN[C@H](C)CC2=CC(=C(C=C2)OC)S(=O)(=O)N	Benign prostatic hyperplasia	alpha-1 blocker	444.9	2.2	2	6	10	102.0
Dutasteride	6918296	C[C@]12CC[C@H]3[C@H]([C@@H]1CC[C@@H]2C(=O)NC4=C(C=CC(=C4)C(F)(F)F)C(F)(F)F)CC[C@@H]5[C@@]3(C=CC(=O)N5)C	Benign prostatic hyperplasia	5-alpha reductase inhibitor	528.5	5.4	2	3	3	58.2
Silodosin	5312125	CC(C)N(CCCOC1=CC=C(C=C1)C(F)(F)F)CCC2=CC(=C(C=C2)C(=O)N)OCC	Benign prostatic hyperplasia	alpha-1 blocker	495.5	3.0	2	6	12	85.8
Oxybutynin	4634	CCN(CC)CC#CCOC(=O)C(C1CCCCC1)(C2=CC=CC=C2)O	Overactive bladder	antimuscarinic	357.5	4.0	1	4	8	49.8
Solifenacin	154427	C1CN2CCC1C(C2)OC(=O)N3CCC4=CC=CC=C4C3C5=CC=CC=C5	Overactive bladder	antimuscarinic	362.5	3.7	0	4	4	41.9
Tolterodine	148401	CC(C)N(CCC(C1=CC=CC=C1)C2=C(C=CC(=C2)C)O)C(C)C	Overactive bladder	antimuscarinic	325.5	5.4	1	2	7	23.5
Mirabegron	9863652	C1=CC=C(C=C1)CCNC(=O)CC2=CC=C(C=C2)OCC(C3=CC=CC=C3)O	Overactive bladder	beta-3 agonist	396.5	2.9	3	5	10	87.6
Sildenafil	5212	CCCC1=NN(C2=C1N=C(NC2=O)C3=C(C=CC(=C3)S(=O)(=O)N4CCN(CC4)C)OCC)C	Erectile dysfunction	PDE5 inhibitor	474.6	1.9	1	9	7	113.4
`.trim();

function parse() {
  const seen = new Set();
  const drugs = [];
  for (const line of TSV.split("\n")) {
    const cols = line.split("\t");
    if (cols.length < 11) continue;
    const [name, cid, smiles, indication, klass, mw, xlogp, hbd, hba, rot, tpsa] = cols;
    const id = String(cid).trim();
    const key = id + "|" + name.trim().toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    drugs.push({
      id,
      name: name.trim(),
      cid: Number(id),
      smiles: smiles.trim(),
      indication: indication.trim(),
      class: klass.trim(),
      mw: Number(mw),
      xlogp: Number(xlogp),
      hbd: Number(hbd),
      hba: Number(hba),
      rot: Number(rot),
      tpsa: Number(tpsa),
    });
  }
  drugs.sort((a, b) => a.name.localeCompare(b.name) || a.cid - b.cid);
  return drugs;
}

const drugs = parse();
const out = {
  source: "Curated from public FDA-approved small-molecule labels and PubChem compound records (CIDs and physicochemical properties). Not exhaustive; intended as a representative screening library.",
  count: drugs.length,
  drugs,
};
const dest = path.join(__dirname, "..", "public", "data", "approvedDrugs.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log("wrote", drugs.length, "drugs to", dest);
