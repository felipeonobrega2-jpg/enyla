// Chamar pelo nome só quando é nome de gente. "Patoxx", "WSSACOLAS", "Comercial", "MAJU & NEW SAM", "K", e-mail ou
// número ficam sem nome ("Oi, tudo bem?"): chamar a loja pelo nome soa robô. Uma regra só para o sistema inteiro.
// Critério: o primeiro nome tem que estar na lista de nomes de pessoa (comuns no Brasil e alguns estrangeiros), e o
// contato não pode ter cara de empresa. Na dúvida, sem nome.

const NOMES = new Set([
  "aaron abel abigail abner abraao acacio ada adalberto adao adelaide adelia ademar ademir adilson adir adolfo",
  "adriana adriano adriele adrielly agatha agnaldo agostinho aguinaldo aida airton alan alana alberto alceu",
  "alcides alda aldo alessandra alessandro alex alexandra alexandre alexia alfredo alice aline alison alisson",
  "allan alma almir aloisio altair alvaro amanda amelia ana anderson andre andrea andreia andressa andreza",
  "angela angelica angelo anita anna anne antonella antonia antonio aparecida aparecido apolo ariane arianne",
  "ariel arlete arlindo armando arnaldo arthur artur assis augusto aurea aurora ayla barbara bartolomeu batista",
  "beatriz bela belinda benedita benedito benicio benjamin bento bernardo betania betina bia bianca bill bob",
  "bonifacio brena brenda breno bruna brunno bruno bryan caio camila camilo candido carina carine carla carlos",
  "carlota carmem carmen carol carolina caroline cassia cassiano cassio catarina caua cauan cecilia celia celio",
  "celso cesar charlene charles chris cibele cicero cida cilene cindy clara clarice clarissa claudete claudia",
  "claudiane claudinei claudio cleber cleberson cleide cleiton clemente cleo cleusa clovis conceicao cristian",
  "cristiane cristiano cristina dafne daiana daiane dalila dalton damares damiao daniel daniela daniele danielle",
  "danilo dante dara dario davi david davison debora deise deivid dejair delma denilson denis denise diana diego",
  "dilma dimas diogo dirce dirceu djalma domingos donizete dora doralice douglas dulce durval eber edgar edilene",
  "edilson edinho edir edite edivaldo edmilson edmundo edna edson eduarda eduardo elaine elba eleonora eli elia",
  "eliana eliane elias elida eliel elis elisa elisabete elisangela eliseu elizabeth ellen eloa eloisa elton",
  "elvis ema emanuel emanuele emanuelly emerson emilia emiliano emilly emily enzo eraldo eric erica erick erika",
  "ernesto estela ester esther eugenio eunice eva evandro evelin evelyn everton ezequiel fabiana fabiano fabio",
  "fabiola fabricio fatima felicia felipe felix fernanda fernando filipe flavia flavio florencio franciele",
  "francine francisca francisco frederico gabi gabriel gabriela gabriele gabrielle gael geovana geovane geraldo",
  "gerson gessica gilberto gilda gilmar gilson giovana giovane giovani giovanna giovanni gisele giselle gislaine",
  "glauber glaucia gleice gloria graca graciele grazi graziela greice guilherme gustavo haroldo hassan heitor",
  "helena helio heloisa henrique herbert herminio hilda hugo humberto iago ian iara icaro ida igor ilda ilson",
  "ines ingrid iolanda iracema irene iris isa isaac isabel isabela isabella isabelle isadora isaias isis ismael",
  "israel italo ivan ivana ivete ivo ivone izabel izabela jacinto jacira jackson jade jadson jaime jair jairo",
  "jamile jana janaina jane janete jaqueline jarbas jasmin jean jeferson jefferson jenifer jennifer jeremias",
  "jessica jhon jhonatan jimmy joana joao joaquim joel joelma joice jonas jonatan jonathan jordana jorge jose",
  "josefa josiane josias josue joyce juan judite julia juliana juliano julieta julio junior jurandir jussara",
  "kaio kaique kamila karen karina karine karla kassia katia kaua kauan kayla keila kelly kelvin kevin kiara",
  "lais lara larissa laura lauro lavinia lazaro lea leandra leandro leda leila leo leon leonardo leonel leticia",
  "levi lia liam lidia lilian liliane lina lindomar lisandra livia lorena lorenzo louise luan luana lucas lucca",
  "lucia luciana luciano luciene lucimara lucio ludmila luis luisa luiz luiza luma lurdes luzia madalena magali",
  "magda maiara maira maisa manoel manuel manuela mara marcela marcelo marcia marcio marco marcos margarete",
  "maria mariana marilene marilia marina mario marisa marisol marlene marli marta mateus matheus mauricio mauro",
  "max mayara mayra meire melissa michael michel michele micheli miguel milena milton miriam moacir moises",
  "monica murilo nadia nadir naiara nair nanda natalia natalie natan nathalia nathan neide neiva nelson neusa",
  "newton nicolas nicole nilson nilton nina noemi nubia nuno odair olavo olga olivia omar orlando oscar osmar",
  "osvaldo otavio pablo paloma pamela paola patricia patrick paula paulina paulo pedro pietra pietro priscila",
  "priscilla rafael rafaela raimunda raimundo raissa ramon raniere raphael raquel rayane rebeca regiane regina",
  "reginaldo reinaldo renan renata renato ricardo rita roberta roberto robson rodolfo rodrigo rogerio romario",
  "romildo ronaldo rosa rosana rosangela rose roseli rosemeire rubens rui ruth sabrina salete samanta samara",
  "samuel sandra sandro sara sarah saulo sebastiao selma sergio severino sheila sidney silas silvana silvia",
  "silvio simone sofia solange sonia stefani stefany stella suelen sueli suzana suzane tabata taina tainara tais",
  "talita tamires tania tatiana tatiane teresa tereza thais thaisa thalia thiago tiago tobias tomas tulio",
  "ubirajara ulisses umberto valdemar valdir valentina valeria valter vanda vanderlei vanessa vania vera",
  "veronica vicente victor vilma vinicius violeta virginia vitor vitoria vivian viviane wagner waldir walter",
  "wanda wanderson washington wellington wesley will william willian wilson xavier yara yasmin yuri zelia zilda",
  "zuleica",
].join(" ").split(" "))

const EMPRESA = /\b(ltda|eireli|mei|s\/?a|comercial|com[eé]rcio|loja|store|shop|oficial|official|embalage?ns?|cosm[eé]ticos?|perfumaria|perfumes?|ess[eê]ncias?|fragr[aâ]ncias?|aromas?|distribuidora|atacado|varejo|vendas|gr[aá]fica|digital|studio|est[uú]dio|sal[aã]o|gest[aã]o|alimentos|nutri|nutre|[aá]udio|musical|sacolas|marketing|empresa|ind[uú]stria|f[aá]brica|import|export|brasil|grupo|servi[cç]os|solu[cç][oõ]es|consultoria|ateli[eê]|boutique|modas?|beauty|cosmetics|presentes|doces|chocolates?|caf[eé]|restaurante|delivery|express|center|clube?|agro|farma|cl[ií]nica)\b/i

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function nomeParaChamar(nome: string | null | undefined): string {
  const bruto = String(nome ?? "").trim()
  if (!bruto || /[@&\d]|https?:|www\./i.test(bruto) || EMPRESA.test(semAcento(bruto))) return ""
  // Tira emoji e símbolo: "Jimmy ✌🏻", "Ana 🌸" viram "Jimmy", "Ana"
  const limpo = bruto.replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim()
  const palavras = limpo.split(" ").filter(Boolean)
  if (!palavras.length || palavras.length > 5) return ""
  const primeiro = palavras[0]
  if (!NOMES.has(semAcento(primeiro))) return ""
  return primeiro[0].toUpperCase() + primeiro.slice(1).toLowerCase()
}
