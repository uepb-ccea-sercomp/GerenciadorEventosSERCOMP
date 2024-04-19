export interface RegisterUserRequestParams {
    nome: string;
    email: string;
    nome_cracha: string;
    instituicao: string;
    atividades?: AtividadesParams;
};

export interface AtividadesParams{
    minicurso_id?: string;
    workshop_id?: string;
    oficina_id?: string; 
}