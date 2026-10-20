"""Prepare a local render-only copy of the licensed itch.io padlock."""
import bpy, math, json, pathlib, os
from mathutils import Vector
root=pathlib.Path(os.environ['PADLOCK_WORKSPACE'])
bpy.context.scene.frame_set(1)
names={'Cube':'PadlockBody','Cubo':'KeyholePlate','Esfera':'KeyholeInset','Toroide':'Shackle'}
for obj in list(bpy.data.objects):
    if obj.type!='MESH':
        bpy.data.objects.remove(obj,do_unlink=True)
        continue
    obj.animation_data_clear()
    obj.name=names[obj.name]
    # The retained leg stays seated while the free leg lifts and swivels.
    if obj.name=='Shackle':
        for vertex in obj.data.vertices:
            if vertex.co.x<-.6 and vertex.co.z<.5:
                vertex.co.z-=.75*min(1,(.5-vertex.co.z)/.35)
        pivot=Vector((-1.04,0,0))
        for vertex in obj.data.vertices:
            vertex.co-=pivot
        obj.location=pivot
    for polygon in obj.data.polygons:
        polygon.use_smooth=True
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')

for mat in bpy.data.materials:
    mat.use_nodes=True
    nodes=mat.node_tree.nodes
    nodes.clear()
    out=nodes.new('ShaderNodeOutputMaterial')
    bsdf=nodes.new('ShaderNodeBsdfPrincipled')
    mat.node_tree.links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
    bsdf.inputs['Metallic'].default_value=.35
    for key,filename,socket in [('Diffuse','diff','Base Color'),('Rough','rough','Roughness')]:
        tex=nodes.new('ShaderNodeTexImage')
        tex.image=bpy.data.images.load(str(root/'assets'/f'rusty_metal_05_{filename}_1k.jpg'),check_existing=True)
        if key!='Diffuse': tex.image.colorspace_settings.name='Non-Color'
        mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs[socket])
        if key=='Diffuse' and mat.name!='cerrojo2':
            mat.node_tree.links.remove(bsdf.inputs[socket].links[0])
            bsdf.inputs[socket].default_value=(.19,.17,.13,1)
    tex=nodes.new('ShaderNodeTexImage')
    tex.image=bpy.data.images.load(str(root/'assets'/'rusty_metal_05_nor_gl_1k.jpg'),check_existing=True)
    tex.image.colorspace_settings.name='Non-Color'
    normal=nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value=.45
    mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color'])
    mat.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])

shackle=bpy.data.objects['Shackle']
for frame,lift,angle in [(1,0,0),(20,1.5,0),(42,1.5,math.radians(-65))]:
    shackle.location=(-1.04,0,lift)
    shackle.rotation_euler=(0,0,angle)
    shackle.keyframe_insert('location',frame=frame)
    shackle.keyframe_insert('rotation_euler',frame=frame)
shackle.animation_data.action.name='PadlockUnlock'
scene=bpy.context.scene
scene.frame_start=1
scene.frame_end=42
scene.render.fps=30
scene.frame_set(1)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(root/'assets'/'rusty-padlock.glb'),export_format='GLB',
                        use_selection=True,export_animations=True,export_frame_range=True,
                        export_animation_mode='SCENE',export_anim_scene_split_object=False,
                        export_force_sampling=True)
print('PREPARED_PADLOCK',root/'assets'/'rusty-padlock.glb')
