// Gazetteer: cidades de Pernambuco, lugares fora do estado e pontos de referência do Recife.
// "ambiguous": o nome também é palavra comum ou sobrenome; só conta com preposição de lugar antes ("em Escada").

export type Scope = 'recife' | 'rmr' | 'pe' | 'fora';
export interface Place { name: string; scope: Scope; ambiguous?: boolean }

const P = (names: string, scope: Scope, ambiguous = false): Place[] => names.split(',').map((n) => ({ name: n.trim(), scope, ambiguous }));

export const PLACES: Place[] = [
  ...P('Recife', 'recife'),
  // Região Metropolitana do Recife
  ...P('Olinda, Jaboatão dos Guararapes, Jaboatão, Camaragibe, São Lourenço da Mata, Abreu e Lima, Igarassu, Cabo de Santo Agostinho, Ipojuca, Porto de Galinhas, Ilha de Itamaracá, Itamaracá, Itapissuma, Araçoiaba, Região Metropolitana do Recife, Grande Recife', 'rmr'),
  ...P('Paulista, Moreno, Cabo', 'rmr', true),
  // Interior e litoral de Pernambuco (principais municípios)
  ...P('Caruaru, Petrolina, Garanhuns, Vitória de Santo Antão, Santa Cruz do Capibaribe, Serra Talhada, Arcoverde, Gravatá, Goiana, Carpina, Belo Jardim, Bezerros, Barreiros, Sirinhaém, Tamandaré, Salgueiro, Ouricuri, Araripina, Surubim, Limoeiro, Pesqueira, Timbaúba, Nazaré da Mata, Bom Conselho, Buíque, Afogados da Ingazeira, Toritama, Fernando de Noronha, São José do Egito, Petrolândia, Cabrobó, Custódia, Sertânia, Lajedo, Água Preta, Catende, Itambé, Glória do Goitá, Chã Grande, Agrestina, Cupira, São Bento do Una, Paudalho, Vicência, Macaparana, Santa Maria da Boa Vista, Lagoa Grande, Orocó, Bodocó, Trindade, Ipubi, Triunfo, Tabira, Itapetim, Flores, Belém do São Francisco, Rio Formoso, São José da Coroa Grande, Gameleira, Joaquim Nabuco, Ribeirão, Primavera, Amaraji, Cortês, Pombos, Feira Nova, Passira, Orobó, João Alfredo, Bom Jardim, Taquaritinga do Norte, Vertentes, Brejo da Madre de Deus, Jataúba, Cachoeirinha, São Caitano, Tacaimbó, Sanharó, Venturosa, Pedra, Águas Belas, Itaíba, Inajá, Tupanatinga, Ibimirim, Manari, Canhotinho, Quipapá, Palmeirina, Correntes, Lajedo, Jupi, Jurema, Panelas, Altinho, Ibirajuba, Cumaru, Riacho das Almas, Frei Miguelinho, Santa Maria do Cambucá, Casinhas, Ferreiros, Camutanga, Aliança, Condado, Tracunhaém, Buenos Aires, Lagoa de Itaenga, Lagoa do Carro, Chã de Alegria, Exu, Moreilândia, Granito, Serrita, Cedro, Verdejante, Mirandiba, Carnaíba, Quixaba, Solidão, Ingazeira, Iguaracy, Santa Terezinha, Calumbi, Betânia, Carnaubeira da Penha, Tacaratu, Jatobá, Itacuruba, Agreste, Sertão, Zona da Mata, Vale do São Francisco', 'pe'),
  ...P('Escada, Palmares, Bonito, Floresta, Bezerros, Pernambuco', 'pe', true),
  // Fora de Pernambuco
  ...P('Paraíba, Alagoas, Bahia, Ceará, Rio Grande do Norte, Sergipe, Piauí, Maranhão, Pará, Amazonas, São Paulo, Rio de Janeiro, Minas Gerais, Espírito Santo, Paraná, Santa Catarina, Rio Grande do Sul, Goiás, Distrito Federal, Brasília, Mato Grosso, Tocantins, Rondônia, Roraima, Acre, Amapá, João Pessoa, Campina Grande, Maceió, Aracaju, Teresina, São Luís, Belo Horizonte, Manaus, Belém, Porto Alegre, Curitiba, Florianópolis, Goiânia, Cuiabá, Juazeiro do Norte, Juazeiro, Mossoró, Arapiraca, Estados Unidos, Portugal, Argentina, Europa', 'fora'),
  ...P('Natal, Salvador, Fortaleza, Vitória, Palmas', 'fora', true),
];

/** Pontos de referência do Recife que não têm o nome do bairro. Só são usados se o bairro existir no banco. */
export const LANDMARKS: { name: string; bairroId: string }[] = [
  { name: 'Marco Zero', bairroId: 'recife-antigo' },
  { name: 'Paço do Frevo', bairroId: 'recife-antigo' },
  { name: 'Rua do Bom Jesus', bairroId: 'recife-antigo' },
  { name: 'Cais do Sertão', bairroId: 'recife-antigo' },
  { name: 'Torre Malakoff', bairroId: 'recife-antigo' },
  { name: 'Embaixada dos Bonecos Gigantes', bairroId: 'recife-antigo' },
  { name: 'Instituto Ricardo Brennand', bairroId: 'varzea' },
  { name: 'Oficina Francisco Brennand', bairroId: 'varzea' },
  { name: 'Oficina Cerâmica Francisco Brennand', bairroId: 'varzea' },
  { name: 'Shopping Recife', bairroId: 'boa-viagem' },
  { name: 'Parque Dona Lindu', bairroId: 'boa-viagem' },
  { name: 'Segundo Jardim', bairroId: 'boa-viagem' },
  { name: 'Shopping RioMar', bairroId: 'pina' },
  { name: 'RioMar Shopping', bairroId: 'pina' },
  { name: 'Shopping Tacaruna', bairroId: 'santo-amaro' },
  { name: 'Parque 13 de Maio', bairroId: 'boa-vista' },
  { name: 'Avenida Conde da Boa Vista', bairroId: 'boa-vista' },
  { name: 'Sítio Trindade', bairroId: 'casa-amarela' },
  { name: 'Hospital Agamenon Magalhães', bairroId: 'casa-amarela' },
  { name: 'Museu do Homem do Nordeste', bairroId: 'casa-forte' },
];

/** Siglas de estado entre parênteses: "Boa Vista (RR)". */
export const UF_OUTSIDE = /\((AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\)/g;
