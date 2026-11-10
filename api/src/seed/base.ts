import type { Bairro, City, Program, Street, User } from '../../../shared/domain/types';

export const ago = (days: number) => Date.now() - days * 864e5;
export const hours = (h: number) => h / 24;

export const CITIES: City[] = [
  { id: 'recife', name: 'Recife', state: 'PE', lat: -8.0631, lng: -34.9105, zoom: 12 },
  { id: 'olinda', name: 'Olinda', state: 'PE', lat: -7.9975, lng: -34.853, zoom: 13 },
  { id: 'jaboatao', name: 'Jaboatão dos Guararapes', state: 'PE', lat: -8.155, lng: -34.94, zoom: 12 },
];

// Coordenadas aproximadas do centro de cada bairro (exemplo). Limites reais: scripts/importar-limites.mjs.
const b = (id: string, name: string, region: string, lat: number, lng: number, aliases: string[] = [], confusableWith: string[] = [], cityId = 'recife'): Bairro =>
  ({ id, cityId, name, region, lat, lng, aliases, confusableWith, active: true });

export const BAIRROS: Bairro[] = [
  b('casa-amarela', 'Casa Amarela', 'Zona Norte', -8.0265, -34.9175, [], ['casa-forte']),
  b('casa-forte', 'Casa Forte', 'Zona Norte', -8.0375, -34.9245, [], ['casa-amarela']),
  b('boa-vista', 'Boa Vista', 'Centro', -8.0605, -34.8895, [], ['boa-viagem']),
  b('boa-viagem', 'Boa Viagem', 'Zona Sul', -8.1265, -34.9, [], ['boa-vista']),
  b('recife-antigo', 'Bairro do Recife', 'Centro', -8.0625, -34.8715, ['Recife Antigo']),
  b('santo-amaro', 'Santo Amaro', 'Centro', -8.046, -34.8785),
  b('espinheiro', 'Espinheiro', 'Zona Norte', -8.0425, -34.8935),
  b('gracas', 'Graças', 'Zona Norte', -8.0475, -34.905, ['Aflitos']),
  b('madalena', 'Madalena', 'Zona Oeste', -8.0575, -34.91),
  b('torre', 'Torre', 'Zona Oeste', -8.0445, -34.9165),
  b('varzea', 'Várzea', 'Zona Oeste', -8.0445, -34.9565),
  b('afogados', 'Afogados', 'Zona Oeste', -8.0785, -34.9085),
  b('ibura', 'Ibura', 'Zona Sul', -8.1175, -34.9405),
  b('imbiribeira', 'Imbiribeira', 'Zona Sul', -8.1085, -34.9125),
  b('pina', 'Pina', 'Zona Sul', -8.0895, -34.884),
  b('nova-descoberta', 'Nova Descoberta', 'Zona Norte', -8.0065, -34.9265),
  b('agua-fria', 'Água Fria', 'Zona Norte', -8.0165, -34.8975),
  b('beberibe', 'Beberibe', 'Zona Norte', -8.0005, -34.8855),
  b('tejipio', 'Tejipió', 'Zona Oeste', -8.0885, -34.9525),
  b('campo-grande', 'Campo Grande', 'Zona Norte', -8.0345, -34.8795),
  b('olinda-carmo', 'Carmo', 'Sítio Histórico', -8.0167, -34.8497, [], [], 'olinda'),
  b('olinda-bairro-novo', 'Bairro Novo', 'Orla', -8.0006, -34.8414, [], [], 'olinda'),
  b('olinda-casa-caiada', 'Casa Caiada', 'Orla', -7.9883, -34.8394, [], ['casa-amarela', 'casa-forte'], 'olinda'),
  b('olinda-peixinhos', 'Peixinhos', 'Oeste', -8.0206, -34.8725, [], [], 'olinda'),
  b('olinda-rio-doce', 'Rio Doce', 'Norte', -7.9606, -34.8331, [], [], 'olinda'),
  b('jaboatao-piedade', 'Piedade', 'Orla', -8.1669, -34.9153, [], [], 'jaboatao'),
  b('jaboatao-candeias', 'Candeias', 'Orla', -8.2011, -34.9211, [], [], 'jaboatao'),
  b('jaboatao-prazeres', 'Prazeres', 'Centro', -8.1628, -34.9361, [], [], 'jaboatao'),
  b('jaboatao-cavaleiro', 'Cavaleiro', 'Norte', -8.0844, -34.9675, [], [], 'jaboatao'),
];

export const STREETS: Street[] = [
  { name: 'Avenida Boa Viagem', bairroId: 'boa-viagem' },
  { name: 'Rua Boa Vista', bairroId: 'casa-amarela' },
  { name: 'Rua da Madalena', bairroId: 'torre' },
  { name: 'Rua Casa Forte', bairroId: 'espinheiro' },
  { name: 'Estrada do Arraial', bairroId: 'casa-amarela' },
  { name: 'Rua Alto do Céu', bairroId: 'casa-amarela' },
];

export const PROGRAMS: (Program & { baseUrl?: string })[] = [
  { id: 'bom-dia-pe', name: 'Bom Dia PE', short: 'BDPE', schedule: 'Seg. a sex., 6h', kind: 'telejornal', active: true },
  { id: 'ne1', name: 'NE1', short: 'NE1', schedule: 'Seg. a sáb., 11h45', kind: 'telejornal', active: true },
  { id: 'ne2', name: 'NE2', short: 'NE2', schedule: 'Seg. a sáb., 19h', kind: 'telejornal', active: true },
  { id: 'calendario-pe', name: 'Calendário PE', short: 'CAL', schedule: 'Sábados, 13h', kind: 'comunitario', active: true },
  { id: 'portal', name: 'Portal da emissora', short: 'WEB', schedule: 'Contínuo', kind: 'portal', active: true },
  { id: 'g1-pe', name: 'G1 Pernambuco', short: 'G1', schedule: 'Contínuo', kind: 'portal', active: true, baseUrl: 'https://g1.globo.com/pe/pernambuco/' },
];

const u = (id: string, name: string, handle: string, role: User['role'], bio: string, hue: number, bairroId?: string, followed: string[] = []): User =>
  ({ id, name, handle, role, bio, hue, bairroId, followed, saved: [], blocked: false, locationAllowed: false });

export const USERS: User[] = [
  u('marina', 'Marina Albuquerque', 'marinadoalto', 'morador', 'Professora. Moro no Alto de Casa Amarela e acompanho tudo que passa por aqui.', 340, 'casa-amarela', ['espinheiro']),
  u('jose', 'Seu José Ferreira', 'seuzedafeira', 'morador', 'Aposentado, 71 anos. Feirante de Casa Amarela há quatro décadas.', 28, 'casa-amarela', ['casa-amarela']),
  u('lucia', 'Lúcia Barbosa', 'luciabarbosa', 'morador', 'Agente comunitária de saúde.', 150, 'casa-amarela', ['casa-amarela', 'nova-descoberta']),
  u('rafael', 'Rafael Monteiro', 'rafa_varzea', 'morador', 'Estudante, ando de bicicleta pela Várzea.', 195, 'varzea', ['varzea', 'torre']),
  u('helena', 'Helena Cavalcanti', 'helenacavalcanti', 'jornalista', 'Repórter de cidades da redação.', 8, undefined, ['casa-amarela', 'boa-vista']),
  u('bruno', 'Bruno Tavares', 'brunotavares', 'jornalista', 'Editor de comunidade.', 262, undefined, ['ibura', 'varzea']),
  u('camila', 'Camila Rocha', 'camilarocha', 'moderador', 'Moderação da comunidade.', 118),
  u('paulo', 'Paulo Nunes', 'paulonunes', 'admin', 'Coordenação de produto e dados da redação.', 45),
];
