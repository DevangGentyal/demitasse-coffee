import { getOutlets } from '@/lib/services/backendApi'

export interface AdminOutlet {
    id: string
    name: string
    email?: string
    phone?: string
    location?: string
    status?: string
}

export const getAllOutlets = async (): Promise<AdminOutlet[]> => {
    const outlets = await getOutlets()

    return outlets.map((o: any) => ({
        id: o.id,
        name: o.name || 'Unnamed Outlet',
        email: o.email,
        phone: o.phone,
        location: o.location,
        status: o.status,
    }))
}